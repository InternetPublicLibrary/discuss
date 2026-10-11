import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import type { GReply } from './adapt';
import { discussionRoutes } from './routes';

const REPO = 'InternetPublicLibrary/discuss-sandbox';
let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

const reply = (n: number): GReply => ({
  id: `R${n}`, author: { avatarUrl: 'a', login: 'reader', url: 'u' }, viewerDidAuthor: false, createdAt: '2026-10-01T00:00:00Z', url: `u#${n}`,
  authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: `<p>${n}</p>`, reactionGroups: [], replyTo: { id: 'C1' },
});

/** A comment with 150 replies; pages of 100 from the newest, like GitHub's `last/before`. */
function github(repository = REPO) {
  const all = Array.from({ length: 150 }, (_v, index) => reply(index + 1));
  return new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, (call) => {
    const { before } = (call.body as { variables: { before: string | null } }).variables;
    const end = before ? Number(before) : all.length;
    const start = Math.max(0, end - 100);
    return Response.json({
      data: { node: { discussion: { repository: { nameWithOwner: repository } }, replies: { totalCount: 150, pageInfo: { hasPreviousPage: start > 0, startCursor: String(start) }, nodes: all.slice(start, end) } } },
    });
  });
}

const request = (fake: FakeGitHub, query: string) => {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api', discussionRoutes(fake.fetch));
  return app.request(`/api/comments/replies?${query}`, {}, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem });
};

let unique = 0;
describe('GET /api/comments/replies (#22)', () => {
  it('loads all 150 replies in pages of 100, matching totalCount', async () => {
    const fake = github();
    const comment = `DC_${Date.now()}_${unique++}`;
    const first = (await (await request(fake, `repo=${REPO}&comment=${comment}`)).json()) as { totalCount: number; replies: { id: string }[]; startCursor: string };
    const second = (await (await request(fake, `repo=${REPO}&comment=${comment}&before=${first.startCursor}`)).json()) as { replies: { id: string }[]; startCursor: string | null };

    expect(first.totalCount).toBe(150);
    expect(first.replies).toHaveLength(100);
    expect(second.replies).toHaveLength(50);
    expect(second.startCursor).toBeNull();
    expect(new Set([...first.replies, ...second.replies].map((item) => item.id)).size).toBe(150);
  });

  it('refuses a comment from another repository', async () => {
    const response = await request(github('secret/private'), `repo=${REPO}&comment=DC_x${unique++}`);

    expect(response.status).toBe(404);
  });

  it.each(['comment=../x', 'comment=', `comment=DC&before=${'x'.repeat(201)}`])('rejects %s', async (query) => {
    expect((await request(github(), `repo=${REPO}&${query}`)).status).toBe(400);
  });
});
