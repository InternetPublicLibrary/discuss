import { type Context, Hono } from 'hono';
import { REACTIONS, type Comment, type Reaction, type ReactionGroups, type Reply } from '../../shared/types';
import { canonicalPathTerm, isValidTerm } from '../../shared/terms';
import { assertWidgetWrite, githubToken, requireSession } from '../auth/sessions';
import { assertRepositoryAllowed, isAllowedOrigin, loadAllowLists } from '../config';
import type { Env } from '../env';
import { AppError, readJsonObject } from '../errors';
import { gitHubAppFromEnv } from '../github/client';
import { adaptComment, adaptReactionGroups, adaptReply, type GComment, type GReactionGroup, type GReply } from './adapt';
import { findOrCreateDiscussion } from './find-or-create';
import { REPLY_FIELDS } from './graphql';
import { bumpCacheVersion, repoRef } from './read';

/**
 * Writes by GitHub readers (spec 002 T4): the Worker calls GitHub with the reader's own token, kept server-side, so
 * comments and reactions are authored by the reader. ORCID readers post through the App (spec 003).
 */
const MAX_BODY = 65_536;
const ENSURE_PER_HOUR = 10;
const COMMENT_FIELDS = REPLY_FIELDS.replace(' replyTo { id }', '');
const ADD_COMMENT = `mutation($input: AddDiscussionCommentInput!) { addDiscussionComment(input: $input) { comment { ${COMMENT_FIELDS} upvoteCount viewerHasUpvoted viewerCanUpvote replies(last: 1) { totalCount nodes { ${REPLY_FIELDS} } } } } }`;
const ADD_REPLY = `mutation($input: AddDiscussionCommentInput!) { addDiscussionComment(input: $input) { comment { ${REPLY_FIELDS} } } }`;
const REACTION = (verb: 'add' | 'remove') =>
  `mutation($input: ${verb === 'add' ? 'AddReactionInput' : 'RemoveReactionInput'}!) { ${verb}Reaction(input: $input) { subject { reactionGroups { content users { totalCount } viewerHasReacted } } } }`;

type AppContext = Context<{ Bindings: Env }>;

interface PageInput {
  repo: string;
  categoryId: string;
  category?: string;
  term: string;
  title: string;
  description?: string;
  backLink: string;
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

/** The page a first write creates a discussion for (same fields client.js sends to the widget). */
function pageInput(body: Record<string, unknown>, repo: string): PageInput {
  const term = text(body.term, 500).normalize('NFC');
  if (!isValidTerm(term)) throw new AppError('EMPTY_TERM', 'The page has no discussion term.');
  const categoryId = text(body.categoryId, 100);
  if (!categoryId) throw new AppError('CATEGORY_MISMATCH', 'The page has no discussion category.');
  return {
    repo,
    categoryId,
    ...(text(body.category, 100) ? { category: text(body.category, 100) } : {}),
    term,
    title: text(body.title, 250) || term,
    description: text(body.description, 500),
    backLink: text(body.backLink, 2048),
  };
}

/**
 * The term must be the canonical pathname of `backLink`, an allowed IPL origin, and that page must exist (checked once
 * a day per page, without following redirects).
 */
export async function assertRealPage(c: AppContext, input: PageInput, fetcher?: typeof fetch): Promise<void> {
  let page: URL;
  try {
    page = new URL(input.backLink);
  } catch {
    throw new AppError('BAD_REQUEST', 'The page link is invalid.');
  }
  if (!isAllowedOrigin(page.origin, loadAllowLists(c.env)) || page.username || page.password || canonicalPathTerm(page.pathname) !== input.term) {
    throw new AppError('ORIGIN_NOT_ALLOWED', 'Discussions can only be created for IPL pages.');
  }
  const key = `page-exists:${page.origin}${page.pathname}`;
  if (await c.env.DISCUSS_KV.get(key)) return;
  let status: number;
  try {
    status = (await (fetcher ?? fetch)(`${page.origin}${page.pathname}`, { method: 'GET', redirect: 'manual', headers: { 'user-agent': 'ipl-discuss' } })).status;
  } catch {
    status = 0;
  }
  if (status !== 200) throw new AppError('NOT_FOUND', 'This IPL page could not be found.');
  await c.env.DISCUSS_KV.put(key, '1', { expirationTtl: 24 * 60 * 60 });
}

async function writer(c: AppContext, fetcher?: typeof fetch) {
  const found = await requireSession(c);
  assertWidgetWrite(c, found.session);
  const token = await githubToken(c, found, fetcher);
  const body = await readJsonObject(c.req.raw, MAX_BODY + 8 * 1024);
  const repo = assertRepositoryAllowed(body.repo, loadAllowLists(c.env));
  return { token, body, repo, github: gitHubAppFromEnv(c.env, fetcher) };
}

/** The discussion to write to: the one given, or the page's own (found or created by the App, #10). */
async function discussionId(c: AppContext, body: Record<string, unknown>, repo: string): Promise<string> {
  if (typeof body.discussionId === 'string' && /^[A-Za-z0-9_=-]{1,100}$/.test(body.discussionId)) return body.discussionId;
  return (await findOrCreateDiscussion(c.env, pageInput(body, repo))).id;
}

export function writeRoutes(fetcher?: typeof fetch) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post('/comments', async (c) => {
    const { token, body, repo, github } = await writer(c, fetcher);
    const markdown = typeof body.body === 'string' ? body.body.trim() : '';
    if (!markdown) throw new AppError('VALIDATION_FAILED', 'Write something first.', { fields: ['body'] });
    if (markdown.length > MAX_BODY) throw new AppError('PAYLOAD_TOO_LARGE', 'The comment is too long.');
    const replyToId = typeof body.replyToId === 'string' && /^[A-Za-z0-9_=-]{1,100}$/.test(body.replyToId) ? body.replyToId : undefined;
    const id = await discussionId(c, body, repo);

    if (replyToId) {
      const data = await github.graphql<{ addDiscussionComment: { comment: GReply } }>(repoRef(repo), ADD_REPLY, { input: { discussionId: id, replyToId, body: markdown } }, token);
      await bumpCacheVersion(c.env.DISCUSS_KV, repo);
      return c.json({ discussionId: id, reply: adaptReply(data.addDiscussionComment.comment) satisfies Reply }, 201);
    }
    const data = await github.graphql<{ addDiscussionComment: { comment: GComment } }>(repoRef(repo), ADD_COMMENT, { input: { discussionId: id, body: markdown } }, token);
    await bumpCacheVersion(c.env.DISCUSS_KV, repo);
    return c.json({ discussionId: id, comment: adaptComment(data.addDiscussionComment.comment) satisfies Comment }, 201);
  });

  routes.post('/reactions', async (c) => {
    const { token, body, repo, github } = await writer(c, fetcher);
    const content = body.content;
    if (typeof content !== 'string' || !(content in REACTIONS)) throw new AppError('VALIDATION_FAILED', 'Unknown reaction.', { fields: ['content'] });
    // No subject yet: the first reaction on a page creates its discussion and reacts to it (#20).
    const subjectId = typeof body.subjectId === 'string' && /^[A-Za-z0-9_=-]{1,100}$/.test(body.subjectId) ? body.subjectId : await discussionId(c, body, repo);
    const verb = body.remove === true ? 'remove' : 'add';
    const data = await github.graphql<Record<string, { subject: { reactionGroups: GReactionGroup[] } }>>(
      repoRef(repo),
      REACTION(verb),
      { input: { subjectId, content: content as Reaction } },
      token,
    );
    await bumpCacheVersion(c.env.DISCUSS_KV, repo);
    const groups: ReactionGroups = adaptReactionGroups(data[`${verb}Reaction`]?.subject.reactionGroups ?? []);
    return c.json({ subjectId, reactions: groups });
  });

  // data-input="github" (#16): the page's discussion is created (if needed) so readers can comment on github.com.
  // Anonymous: Origin and IP limits only slow scripts down, so creation is also restricted to real IPL pages
  // (pathname term of an existing page on an allowed origin) — at worst one discussion per real page.
  routes.post('/discussions/ensure', async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin) throw new AppError('ORIGIN_NOT_ALLOWED', 'Requests must come from the comment widget.');
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
    const key = `quota:ensure:${ip}:${new Date().toISOString().slice(0, 13)}`;
    const used = Number((await c.env.DISCUSS_KV.get(key)) ?? 0);
    if (used >= ENSURE_PER_HOUR) throw new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', undefined, 3600);
    await c.env.DISCUSS_KV.put(key, String(used + 1), { expirationTtl: 3600 });
    const body = await readJsonObject(c.req.raw, 8 * 1024);
    const repo = assertRepositoryAllowed(body.repo, loadAllowLists(c.env));
    const input = pageInput(body, repo);
    await assertRealPage(c, input, fetcher);
    const found = await findOrCreateDiscussion(c.env, input);
    return c.json({ number: found.number, url: `https://github.com/${repo}/discussions/${found.number}` });
  });

  routes.post('/markdown', async (c) => {
    const { token, body, repo } = await writer(c, fetcher);
    const markdown = typeof body.text === 'string' ? body.text : '';
    if (markdown.length > MAX_BODY) throw new AppError('PAYLOAD_TOO_LARGE', 'The comment is too long.');
    const response = await (fetcher ?? fetch)('https://api.github.com/markdown', {
      method: 'POST',
      headers: { accept: 'text/html', authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'ipl-discuss' },
      body: JSON.stringify({ text: markdown, mode: 'gfm', context: repo }),
    });
    if (response.status === 401) throw new AppError('UNAUTHENTICATED', 'Your GitHub sign-in has expired. Please sign in again.');
    if (!response.ok) throw new AppError('GITHUB_ERROR', 'The preview could not be rendered.', { githubStatus: response.status });
    return c.json({ html: await response.text() });
  });

  return routes;
}
