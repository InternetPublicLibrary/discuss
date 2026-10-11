import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { webhookRoute } from '../webhook';
import type { GComment, GDiscussion } from './adapt';
import { discussionRoutes, invalidateOnChange } from './routes';

const REPO = 'InternetPublicLibrary/discuss-sandbox';
const SECRET = 'webhook-secret';
let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

const comment = (id: string, overrides: Partial<GComment> = {}): GComment => ({
  id, author: { avatarUrl: 'a', login: 'reader', url: 'u' }, viewerDidAuthor: false, createdAt: '2026-10-11T00:00:00Z', url: `https://github.com/x#${id}`,
  authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: `<p>${id}</p>`,
  reactionGroups: [{ content: 'HEART', users: { totalCount: 2 }, viewerHasReacted: false }], upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false,
  replies: { totalCount: 0, nodes: [] }, ...overrides,
});
const discussion = (comments: GComment[]): GDiscussion => ({
  id: 'D_1', number: 7, url: 'https://github.com/x/discussions/7', locked: false, createdAt: '2026-10-11T00:00:00Z', author: { login: 'ipl-discuss[bot]' }, repository: { nameWithOwner: REPO }, reactions: { totalCount: 1 },
  reactionGroups: [{ content: 'THUMBS_UP', users: { totalCount: 1 }, viewerHasReacted: false }],
  comments: { totalCount: comments.length, pageInfo: { startCursor: null, hasNextPage: false, hasPreviousPage: false, endCursor: null }, nodes: comments },
});

function setup(found: GDiscussion | null = discussion([comment('C1')])) {
  const fake = new FakeGitHub()
    .withInstallation()
    .on('GET', /^\/app$/, { slug: 'ipl-discuss' })
    .on('POST', /^\/graphql$/, () => Response.json({ data: { rateLimit: { remaining: 4000, resetAt: '', cost: 1 }, search: { discussionCount: found ? 1 : 0, nodes: found ? [found] : [] } } }));
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api', discussionRoutes(fake.fetch));
  app.post('/api/webhook', webhookRoute({ discussion: invalidateOnChange, discussion_comment: invalidateOnChange }));
  const vars = { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_WEBHOOK_SECRET: SECRET };
  return { fake, request: (path: string, init: RequestInit = {}) => app.request(path, init, vars) };
}

let unique = 0;
const termPath = () => `/api/discussions?repo=${encodeURIComponent(REPO)}&term=${encodeURIComponent(`pt-BR/computacao/${Date.now()}-${unique++}`)}`;
const graphqlCalls = (fake: FakeGitHub) => fake.count('POST', /^\/graphql$/);

async function sign(body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `sha256=${[...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('GET /api/discussions', () => {
  it('returns the adapted discussion for anonymous readers', async () => {
    const { request } = setup();
    const response = await request(termPath());
    const page = (await response.json()) as { viewer: unknown; discussion: { number: number; reactions: Record<string, unknown>; comments: { reactions: Record<string, { count: number }>; replies: unknown[] }[] } };

    expect(response.status).toBe(200);
    expect(page.viewer).toBeNull();
    expect(page.discussion.number).toBe(7);
    expect(page.discussion.comments[0]?.reactions.HEART).toEqual({ count: 2, viewerHasReacted: false });
    expect(Object.keys(page.discussion.reactions)).toHaveLength(8);
  });

  it('serves a second anonymous load of the same page from cache (one GitHub call)', async () => {
    const { request, fake } = setup();
    const path = termPath();
    await request(path);
    await request(path);

    expect(graphqlCalls(fake)).toBe(1);
  });

  it('searches by title, or by the sha1 of the term in strict mode', async () => {
    const { request, fake } = setup();
    await request(`/api/discussions?repo=${encodeURIComponent(REPO)}&term=index&strict=1&category=Comments`);
    const query = (fake.calls.find((call) => call.path === '/graphql')?.body as { variables: { query: string } }).variables.query;

    const { digestHex } = await import('../../shared/digest');

    expect(query).toBe(`repo:internetpubliclibrary/discuss-sandbox category:"Comments" in:body "${await digestHex('index')}"`);
  });

  it('answers a page without a discussion with 404 discussion-not-found', async () => {
    const { request } = setup(null);
    const response = await request(termPath());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { reason: 'discussion-not-found' } });
  });

  it.each([
    ['', 'empty-term', 400],
    [`&term=x&first=500`, 'invalid-request', 400],
  ])('rejects bad queries %j', async (extra, reason, status) => {
    const { request } = setup();
    const response = await request(`/api/discussions?repo=${encodeURIComponent(REPO)}${extra}`);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { reason } });
  });

  it('refuses repositories outside the allow-list', async () => {
    const { request, fake } = setup();
    const response = await request('/api/discussions?repo=someone/blog&term=x');

    expect(response.status).toBe(403);
    expect(fake.calls).toEqual([]);
  });
});

describe('reads after creation (#10)', () => {
  it('finds a discussion through the KV map before GitHub search indexes it', async () => {
    const { digestHex } = await import('../../shared/digest');
    const term = `pt-BR/novo-${Date.now()}`;
    await env.DISCUSS_KV.put(`map:${REPO.toLowerCase()}:DIC_c:${await digestHex(term)}`, JSON.stringify({ id: 'D_new', number: 42 }));
    const fake = new FakeGitHub()
      .withInstallation()
      .on('GET', /^\/app$/, { slug: 'ipl-discuss' })
      .on('POST', /^\/graphql$/, (call) => {
        const variables = (call.body as { variables: { number?: number } }).variables;
        return Response.json(variables.number === 42 ? { data: { repository: { discussion: { ...discussion([]), number: 42 } } } } : { data: { search: { discussionCount: 0, nodes: [] } } });
      });
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api', discussionRoutes(fake.fetch));
    const response = await app.request(`/api/discussions?repo=${encodeURIComponent(REPO)}&term=${encodeURIComponent(term)}&categoryId=DIC_c&strict=1`, {}, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { discussion: { number: number } }).discussion.number).toBe(42);
  });
});

describe('mapping spoofing', () => {
  it('ignores a discussion someone else opened with a copied hash', async () => {
    const spoof = { ...discussion([comment('C1')]), author: { login: 'mallory' } };
    const { request } = setup(spoof);

    expect((await request(termPath())).status).toBe(404);
  });

  it.each([
    ['2025-01-01T00:00:00Z', 200],
    ['2026-12-01T00:00:00Z', 404],
  ])('accepts a legacy author only before the cutoff (created %s → %i)', async (createdAt, status) => {
    const legacy = { ...discussion([comment('C1')]), createdAt, author: { login: 'giscus[bot]' } };
    const fake = new FakeGitHub().withInstallation().on('GET', /^\/app$/, { slug: 'ipl-discuss' }).on('POST', /^\/graphql$/, { data: { search: { discussionCount: 1, nodes: [legacy] } } });
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api', discussionRoutes(fake.fetch));
    const vars = { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, TRUSTED_DISCUSSION_AUTHORS: 'giscus[bot]', LEGACY_DISCUSSIONS_BEFORE: '2026-06-01T00:00:00Z' };

    expect((await app.request(termPath(), {}, vars)).status).toBe(status);
  });

  it('does not trust giscus[bot] at all without a cutoff', async () => {
    const legacy = { ...discussion([comment('C1')]), createdAt: '2020-01-01T00:00:00Z', author: { login: 'giscus[bot]' } };
    const fake = new FakeGitHub().withInstallation().on('GET', /^\/app$/, { slug: 'ipl-discuss' }).on('POST', /^\/graphql$/, { data: { search: { discussionCount: 1, nodes: [legacy] } } });
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api', discussionRoutes(fake.fetch));

    expect((await app.request(termPath(), {}, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, TRUSTED_DISCUSSION_AUTHORS: 'giscus[bot]' })).status).toBe(404);
  });
});

describe('search injection', () => {
  it('keeps quotes and backslashes in the term from adding search qualifiers', async () => {
    const { request, fake } = setup();
    await request(`/api/discussions?repo=${encodeURIComponent(REPO)}&term=${encodeURIComponent('x" repo:secret/private "')}&category=${encodeURIComponent('a" repo:x/y "')}`);
    const query = (fake.calls.find((call) => call.path === '/graphql')?.body as { variables: { query: string } }).variables.query;

    expect(query).toBe('repo:internetpubliclibrary/discuss-sandbox category:"a repo:x/y" in:title "x repo:secret/private"');
    expect(query.match(/"/g)).toHaveLength(4);
  });

  it('never returns a discussion from another repository', async () => {
    const other = { ...discussion([comment('C9')]), repository: { nameWithOwner: 'secret/private' } };
    const { request } = setup(other);

    expect((await request(termPath())).status).toBe(404);
  });
});

describe('webhook invalidation (#9)', () => {
  it('refetches after a signed discussion_comment event for the repository', async () => {
    const { request, fake } = setup();
    const path = termPath();
    await request(path);
    const body = JSON.stringify({ action: 'created', repository: { full_name: REPO }, comment: { id: Date.now() } });
    const delivery = await request('/api/webhook', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'x-github-event': 'discussion_comment', 'x-github-delivery': `d-${Date.now()}`, 'x-hub-signature-256': await sign(body) },
    });
    await request(path);

    expect(await delivery.json()).toMatchObject({ status: 'cache-invalidated' });
    expect(graphqlCalls(fake)).toBe(2);
  });

  it('ignores unsigned deliveries', async () => {
    const { request } = setup();
    const response = await request('/api/webhook', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-github-event': 'discussion' } });

    expect(response.status).toBe(401);
  });
});
