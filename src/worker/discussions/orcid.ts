import { type Context, Hono } from 'hono';
import { ORCID_ID, orcidBody, parseOrcidHeader } from '../../shared/orcid';
import type { Comment, DiscussionPage, Reply } from '../../shared/types';
import { assertWidgetWrite, requireSession } from '../auth/sessions';
import { assertRepositoryAllowed, loadAllowLists } from '../config';
import type { Env } from '../env';
import { AppError, readJsonObject } from '../errors';
import { takeOrThrow } from '../limits';
import { type GitHubApp, gitHubAppFromEnv } from '../github/client';
import { adaptComment, adaptReply, type GComment, type GReply } from './adapt';
import { REPLY_FIELDS } from './graphql';
import { bumpCacheVersion, repoRef } from './read';
import { commentId, DELETE_COMMENT, discussionIdFor, UPDATE } from './writes';

/** Comments by ORCID readers, posted by the IPL App with visible attribution (spec 003 T1, #15). */
export const ORCID_PER_HOUR = 10;
export const ORCID_MAX_LENGTH = 10_000;
/** Set by reads when the App's GraphQL budget runs low: ORCID posting pauses so reads keep working. */
export const LOW_BUDGET_KEY = 'budget:graphql-low';

const COMMENT_FIELDS = REPLY_FIELDS.replace(' replyTo { id }', '');
const ADD = (reply: boolean) =>
  `mutation($input: AddDiscussionCommentInput!) { addDiscussionComment(input: $input) { comment { ${reply ? REPLY_FIELDS : `${COMMENT_FIELDS} upvoteCount viewerHasUpvoted viewerCanUpvote replies(last: 1) { totalCount nodes { ${REPLY_FIELDS} } }`} } } }`;

/** Replace the App bot as author with the ORCID reader, using the header the service itself generated. */
export function markOrcid<T extends Comment | Reply>(item: T, botLogin: string): T {
  if (item.author.login.toLowerCase() !== botLogin.toLowerCase()) return item;
  const parsed = parseOrcidHeader(item.bodyHTML);
  if (!parsed) return item;
  const marked = { ...item, bodyHTML: parsed.bodyHTML, orcidAuthor: parsed.author };
  if ('replies' in marked) (marked as Comment).replies = (marked as Comment).replies.map((reply) => markOrcid(reply, botLogin));
  return marked;
}

export function markOrcidPage(page: DiscussionPage, botLogin: string): DiscussionPage {
  return { ...page, discussion: { ...page.discussion, comments: page.discussion.comments.map((comment) => markOrcid(comment, botLogin)) } };
}

async function assertWithinLimits(c: Context<{ Bindings: Env }>, orcid: string): Promise<void> {
  if (await c.env.DISCUSS_KV.get(LOW_BUDGET_KEY)) {
    throw new AppError('GITHUB_RATE_LIMITED', 'Commenting with ORCID is paused for a while. Please try again later.', undefined, 900);
  }
  await takeOrThrow(c.env, `orcid:${orcid}`, ORCID_PER_HOUR, 3600, `You can post up to ${ORCID_PER_HOUR} comments an hour.`);
}

export function orcidRoutes(fetcher?: typeof fetch) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post('/orcid/comments', async (c) => {
    const { session } = await requireSession(c);
    assertWidgetWrite(c, session);
    if (session.identity.provider !== 'orcid' || !ORCID_ID.test(session.identity.id)) throw new AppError('UNAUTHENTICATED', 'Sign in with ORCID to do this.');
    const body = await readJsonObject(c.req.raw, ORCID_MAX_LENGTH + 8 * 1024);
    const repo = assertRepositoryAllowed(body.repo, loadAllowLists(c.env));
    const markdown = typeof body.body === 'string' ? body.body.trim() : '';
    if (!markdown) throw new AppError('VALIDATION_FAILED', 'Write something first.', { fields: ['body'] });
    if (markdown.length > ORCID_MAX_LENGTH) throw new AppError('PAYLOAD_TOO_LARGE', `Comments can have up to ${ORCID_MAX_LENGTH} characters.`);
    await assertWithinLimits(c, session.identity.id);

    const github: GitHubApp = gitHubAppFromEnv(c.env, fetcher);
    const discussionId = await discussionIdFor(c, body, repo, fetcher);
    const replyToId = typeof body.replyToId === 'string' && /^[A-Za-z0-9_=-]{1,100}$/.test(body.replyToId) ? body.replyToId : undefined;
    const author = { id: session.identity.id, name: session.identity.name, profileUrl: session.identity.profileUrl };
    // As the installation (no reader token): the App is the author on GitHub, the header names the reader.
    const data = await github.graphql<{ addDiscussionComment: { comment: GComment & GReply } }>(repoRef(repo), ADD(!!replyToId), {
      input: { discussionId, body: orcidBody(author, markdown), ...(replyToId ? { replyToId } : {}) },
    });
    await bumpCacheVersion(c.env.DISCUSS_KV, repo);
    const bot = await github.botLogin();
    const created = data.addDiscussionComment.comment;
    return c.json(replyToId ? { discussionId, reply: markOrcid(adaptReply(created), bot) } : { discussionId, comment: markOrcid(adaptComment(created), bot) }, 201);
  });

  /**
   * Edit or delete an ORCID comment (#19). The App is the author on GitHub, so ownership is checked here: the comment
   * must be the bot's, in the allowed repository, and carry the marker of the signed-in iD.
   */
  async function ownComment(c: Context<{ Bindings: Env }>, repoValue: unknown) {
    const { session } = await requireSession(c);
    assertWidgetWrite(c, session);
    if (session.identity.provider !== 'orcid' || !ORCID_ID.test(session.identity.id)) throw new AppError('UNAUTHENTICATED', 'Sign in with ORCID to do this.');
    const repo = assertRepositoryAllowed(repoValue, loadAllowLists(c.env));
    const id = commentId(c.req.param('id') ?? '');
    const github = gitHubAppFromEnv(c.env, fetcher);
    const { node } = await github.graphql<{ node: { body?: string; author?: { login: string } | null; discussion?: { repository: { nameWithOwner: string } } } | null }>(
      repoRef(repo),
      `query($id: ID!) { node(id: $id) { ... on DiscussionComment { body author { login } discussion { repository { nameWithOwner } } } } }`,
      { id },
    );
    const mine =
      node?.discussion?.repository.nameWithOwner.toLowerCase() === repo.toLowerCase() &&
      node.author?.login.toLowerCase() === (await github.botLogin()).toLowerCase() &&
      (node.body ?? '').trimEnd().endsWith(`<!-- ipl-orcid:${session.identity.id} -->`);
    if (!mine) throw new AppError('FORBIDDEN', 'You can only change your own comments.');
    return { session, repo, id, github };
  }

  routes.patch('/orcid/comments/:id', async (c) => {
    const body = await readJsonObject(c.req.raw, ORCID_MAX_LENGTH + 8 * 1024);
    const { session, repo, id, github } = await ownComment(c, body.repo);
    const markdown = typeof body.body === 'string' ? body.body.trim() : '';
    if (!markdown) throw new AppError('VALIDATION_FAILED', 'Write something first.', { fields: ['body'] });
    if (markdown.length > ORCID_MAX_LENGTH) throw new AppError('PAYLOAD_TOO_LARGE', `Comments can have up to ${ORCID_MAX_LENGTH} characters.`);
    const author = { id: session.identity.id, name: session.identity.name, profileUrl: session.identity.profileUrl };
    const data = await github.graphql<{ updateDiscussionComment: { comment: { bodyHTML: string; lastEditedAt: string | null } } }>(repoRef(repo), UPDATE, { input: { commentId: id, body: orcidBody(author, markdown) } });
    await bumpCacheVersion(c.env.DISCUSS_KV, repo);
    const parsed = parseOrcidHeader(data.updateDiscussionComment.comment.bodyHTML);
    return c.json({ bodyHTML: parsed?.bodyHTML ?? '', lastEditedAt: data.updateDiscussionComment.comment.lastEditedAt });
  });

  routes.delete('/orcid/comments/:id', async (c) => {
    const { repo, id, github } = await ownComment(c, c.req.query('repo'));
    await github.graphql(repoRef(repo), DELETE_COMMENT, { input: { id } });
    await bumpCacheVersion(c.env.DISCUSS_KV, repo);
    return c.body(null, 204);
  });

  return routes;
}
