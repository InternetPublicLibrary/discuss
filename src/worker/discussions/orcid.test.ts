import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { randomToken } from '../auth/pkce';
import { SESSION_COOKIE } from '../auth/sessions';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { LOW_BUDGET_KEY, markOrcid, orcidRoutes } from './orcid';
import type { Comment } from '../../shared/types';

const SELF = 'https://discuss.example';
const REPO = 'InternetPublicLibrary/discuss-sandbox';
let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

let counter = 0;
async function session(provider: 'orcid' | 'github' = 'orcid') {
  const id = randomToken();
  const csrfToken = randomToken();
  const orcid = `0000-0002-1825-${String(1000 + (counter++ % 8999)).padStart(4, '0')}`;
  const identity = provider === 'orcid' ? { provider, id: orcid, name: 'Josiah Carberry', profileUrl: `https://sandbox.orcid.org/${orcid}` } : { provider, id: '1', login: 'o', name: 'O', profileUrl: 'x' };
  await env.DISCUSS_KV.put(`session:${id}`, JSON.stringify({ identity, csrfToken, createdAt: '' }));
  return { orcid, headers: { cookie: `${SESSION_COOKIE}=${id}`, 'x-csrf-token': csrfToken } };
}

function github() {
  return new FakeGitHub()
    .withInstallation()
    .on('GET', /^\/app$/, { slug: 'ipl-discuss' })
    .on('POST', /^\/graphql$/, (call) => {
      const { query } = call.body as { query: string };
    if (query.includes('node(id: $id)')) {
      const id = (call.body as { variables: { id: string } }).variables.id;
      const repository = { nameWithOwner: id.includes('other') ? 'secret/private' : REPO };
      return Response.json({ data: { node: id.startsWith('DC') ? { id, discussion: { id: id.includes('elsewhere') ? 'D_elsewhere' : 'D_1', locked: false, repository } } : { id, locked: false, repository } } });
    }
      const input = (call.body as { variables: { input: { body: string; replyToId?: string } } }).variables.input;
      const header = /^\*\*(.+?)\*\* · \[ORCID ([^\]]+)\]\(([^)]+)\)/.exec(input.body);
      return Response.json({
        data: {
          addDiscussionComment: {
            comment: {
              id: 'DC_o', author: { avatarUrl: 'a', login: 'ipl-discuss[bot]', url: 'u' }, viewerDidAuthor: true, createdAt: '2026-10-11T00:00:00Z', url: 'u', authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null,
              bodyHTML: `<p dir="auto"><strong>${header?.[1]}</strong> · <a href="${header?.[3]}" rel="nofollow">ORCID ${header?.[2]}</a> — via IPL discuss</p>\n<p dir="auto">texto</p>`,
              reactionGroups: [], upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replies: { totalCount: 0, nodes: [] }, ...(input.replyToId ? { replyTo: { id: input.replyToId } } : {}),
            },
          },
        },
      });
    });
}

function post(fake: FakeGitHub, body: unknown, headers: Record<string, string>) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api', orcidRoutes(fake.fetch));
  return app.request(`${SELF}/api/orcid/comments`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: SELF, ...headers } }, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem });
}

describe('POST /api/orcid/comments (#15)', () => {
  it('posts as the IPL App with the attribution header and returns the ORCID author, never the bot', async () => {
    const fake = github();
    const { orcid, headers } = await session();
    const response = await post(fake, { repo: REPO, discussionId: 'D_1', body: 'Muito bom <!-- ipl-orcid:9999-9999-9999-9999 -->' }, headers);
    const json = (await response.json()) as { comment: Comment };
    const mutation = fake.calls.find((call) => (call.body as { query?: string } | undefined)?.query?.includes('addDiscussionComment'));
    const sent = (mutation?.body as { variables: { input: { body: string } } }).variables.input.body;

    expect(response.status).toBe(201);
    expect(mutation?.authorization).toMatch(/^Bearer ghs_installation_/);
    expect(sent.startsWith(`**Josiah Carberry** · [ORCID ${orcid}](https://sandbox.orcid.org/${orcid}) — via IPL discuss`)).toBe(true);
    expect(sent.endsWith(`<!-- ipl-orcid:${orcid} -->`)).toBe(true);
    expect(sent.match(/<!-- ipl-orcid:/g)).toHaveLength(1);
    expect(json.comment.orcidAuthor).toEqual({ id: orcid, name: 'Josiah Carberry', profileUrl: `https://sandbox.orcid.org/${orcid}` });
    expect(json.comment.bodyHTML).toBe('<p dir="auto">texto</p>');
    expect(JSON.stringify(json)).not.toContain('ghs_');
  });

  it('refuses to post into a discussion of another repository or reply to a comment of another discussion (no confused deputy)', async () => {
    const fake = github();
    const { headers } = await session();

    expect((await post(fake, { repo: REPO, discussionId: 'D_other', body: 'x' }, headers)).status).toBe(404);
    expect((await post(fake, { repo: REPO, discussionId: 'D_1', replyToId: 'DC_elsewhere', body: 'x' }, headers)).status).toBe(404);
    expect(fake.calls.filter((call) => (call.body as { query?: string } | undefined)?.query?.includes('addDiscussionComment'))).toEqual([]);
  });

  it('counts the hourly limit exactly under parallel requests', async () => {
    const { headers } = await session();
    const results = await Promise.all(Array.from({ length: 15 }, (_v, index) => post(github(), { repo: REPO, discussionId: 'D_1', body: `p${index}` }, headers)));

    expect(results.filter((response) => response.status === 201)).toHaveLength(10);
    expect(results.filter((response) => response.status === 429)).toHaveLength(5);
  });

  it('limits each ORCID iD to 10 comments an hour', async () => {
    const { headers } = await session();
    for (let index = 0; index < 10; index += 1) expect((await post(github(), { repo: REPO, discussionId: 'D_1', body: `c${index}` }, headers)).status).toBe(201);

    const response = await post(github(), { repo: REPO, discussionId: 'D_1', body: 'one more' }, headers);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { reason: 'rate-limited' } });
  });

  it('pauses when the App’s GraphQL budget is low, so reads keep working', async () => {
    await env.DISCUSS_KV.put(LOW_BUDGET_KEY, 'soon', { expirationTtl: 60 });
    const fake = github();
    const { headers } = await session();
    const response = await post(fake, { repo: REPO, discussionId: 'D_1', body: 'x' }, headers);
    await env.DISCUSS_KV.delete(LOW_BUDGET_KEY);

    expect(response.status).toBe(503);
    expect(fake.calls.filter((call) => call.path === '/graphql')).toEqual([]);
  });

  it('refuses long comments, GitHub sessions and missing CSRF', async () => {
    const orcid = await session();
    const githubSession = await session('github');

    expect((await post(github(), { repo: REPO, discussionId: 'D_1', body: 'x'.repeat(10_001) }, orcid.headers)).status).toBe(413);
    expect((await post(github(), { repo: REPO, discussionId: 'D_1', body: 'x' }, githubSession.headers)).status).toBe(401);
    expect((await post(github(), { repo: REPO, discussionId: 'D_1', body: 'x' }, { cookie: orcid.headers.cookie })).status).toBe(403);
  });
});

describe('markOrcid', () => {
  const base = { id: 'C', viewerDidAuthor: false, createdAt: '', url: '', authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, reactions: {}, upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null } as unknown as Comment;
  const header = '<p><strong>Mallory</strong> · <a href="https://orcid.org/0000-0002-1825-0097">ORCID 0000-0002-1825-0097</a> — via IPL discuss</p><p>x</p>';

  it('ignores a header in a comment by anyone but the App bot (no impersonation by GitHub users)', () => {
    const forged = markOrcid({ ...base, author: { avatarUrl: '', login: 'mallory', url: '' }, bodyHTML: header }, 'ipl-discuss[bot]');

    expect(forged.orcidAuthor).toBeUndefined();
    expect(forged.bodyHTML).toBe(header);
  });

  it('marks App-posted comments', () => {
    expect(markOrcid({ ...base, author: { avatarUrl: '', login: 'ipl-discuss[bot]', url: '' }, bodyHTML: header }, 'ipl-discuss[bot]').orcidAuthor?.name).toBe('Mallory');
  });
});
