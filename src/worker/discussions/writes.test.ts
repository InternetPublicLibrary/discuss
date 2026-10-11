import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { seal } from '../auth/crypto';
import { randomToken } from '../auth/pkce';
import { SESSION_COOKIE } from '../auth/sessions';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { mapKey } from './find-or-create';
import { writeRoutes } from './writes';

const SELF = 'https://discuss.example';
const REPO = 'InternetPublicLibrary/discuss-sandbox';
const SECRET = 's'.repeat(40);
let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

const gqlComment = { id: 'DC_new', author: { avatarUrl: 'a', login: 'octocat', url: 'u' }, viewerDidAuthor: true, createdAt: '2026-10-11T00:00:00Z', url: 'u', authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>Olá</p>', reactionGroups: [], upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: true, replies: { totalCount: 0, nodes: [] } };

function github(pageStatus = 200) {
  return new FakeGitHub().withInstallation().on('GET', /^\/pt-BR\//, () => new Response('<html>', { status: pageStatus })).on('POST', /^\/graphql$/, (call) => {
    const { query } = call.body as { query: string };
    if (query.includes('node(id: $id)')) {
      const id = (call.body as { variables: { id: string } }).variables.id;
      const repository = { nameWithOwner: id.includes('other') ? 'secret/private' : REPO };
      return Response.json({ data: { node: id.startsWith('DC') ? { id, discussion: { id: id.includes('elsewhere') ? 'D_elsewhere' : 'D_page', locked: false, repository } } : { id, locked: false, repository } } });
    }

    if (query.includes('addDiscussionComment')) {
      const input = (call.body as { variables: { input: { replyToId?: string } } }).variables.input;
      return Response.json({ data: { addDiscussionComment: { comment: input.replyToId ? { ...gqlComment, id: 'DC_reply', replyTo: { id: input.replyToId } } : gqlComment } } });
    }
    if (query.includes('Reaction(')) return Response.json({ data: { [query.includes('removeReaction') ? 'removeReaction' : 'addReaction']: { subject: { reactionGroups: [{ content: 'HEART', users: { totalCount: 1 }, viewerHasReacted: true }] } } } });
    return Response.json({ errors: [{ message: 'unexpected' }] });
  }).on('POST', /^\/markdown$/, new Response('<p><strong>bold</strong></p>', { headers: { 'content-type': 'text/html' } }));
}

async function session(provider: 'github' | 'orcid' = 'github') {
  const id = randomToken();
  const csrfToken = randomToken();
  const record = {
    identity: provider === 'github' ? { provider, id: '583231', login: 'octocat', name: 'The Octocat', profileUrl: 'https://github.com/octocat' } : { provider, id: '0000-0002-1825-0097', name: 'J', profileUrl: 'x' },
    csrfToken,
    ...(provider === 'github' ? { github: await seal(SECRET, { accessToken: 'ghu_reader' }) } : {}),
    createdAt: '2026-10-11T00:00:00Z',
  };
  await env.DISCUSS_KV.put(`session:${id}`, JSON.stringify(record));
  return { cookie: `${SESSION_COOKIE}=${id}`, csrfToken };
}

function post(fake: FakeGitHub, path: string, body: unknown, headers: Record<string, string>) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api', writeRoutes(fake.fetch));
  return app.request(`${SELF}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: SELF, ...headers } }, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, SESSION_SECRET: SECRET });
}

let unique = 0;
async function page() {
  const term = `pt-BR/write-${Date.now()}-${unique++}`;
  await env.DISCUSS_KV.put(await mapKey(REPO, 'DIC_c', term), JSON.stringify({ id: 'D_page', number: 3 }));
  return { repo: REPO, categoryId: 'DIC_c', term, title: 'Página', backLink: `http://localhost:4000/${term}/` };
}

describe('writes by GitHub readers', () => {
  it('posts a comment as the reader on the page’s discussion, with the reader’s token', async () => {
    const fake = github();
    const { cookie, csrfToken } = await session();
    const response = await post(fake, '/api/comments', { ...(await page()), body: 'Olá' }, { cookie, 'x-csrf-token': csrfToken });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ discussionId: 'D_page', comment: { id: 'DC_new', author: { login: 'octocat' }, viewerDidAuthor: true } });
    const mutation = fake.calls.find((call) => call.path === '/graphql');
    expect(mutation?.authorization).toBe('Bearer ghu_reader');
    expect(mutation?.body).toMatchObject({ variables: { input: { discussionId: 'D_page', body: 'Olá' } } });
  });

  it('replies to a comment', async () => {
    const { cookie, csrfToken } = await session();
    const response = await post(github(), '/api/comments', { repo: REPO, discussionId: 'D_page', replyToId: 'DC_1', body: 'Concordo' }, { cookie, 'x-csrf-token': csrfToken });

    expect(await response.json()).toMatchObject({ reply: { id: 'DC_reply', replyToId: 'DC_1' } });
  });

  it('reacts first on a page without a discussion by creating it, and returns the new counts (#20)', async () => {
    const fake = github();
    const { cookie, csrfToken } = await session();
    const response = await post(fake, '/api/reactions', { ...(await page()), content: 'HEART' }, { cookie, 'x-csrf-token': csrfToken });

    expect(await response.json()).toMatchObject({ subjectId: 'D_page', reactions: { HEART: { count: 1, viewerHasReacted: true } } });
    expect(fake.calls.find((call) => call.path === '/graphql')?.body).toMatchObject({ variables: { input: { subjectId: 'D_page', content: 'HEART' } } });
  });

  it('invalidates cached reads after a write', async () => {
    const { cookie, csrfToken } = await session();
    const before = Number((await env.DISCUSS_KV.get(`cache:version:${REPO.toLowerCase()}`)) ?? 0);
    await post(github(), '/api/reactions', { repo: REPO, subjectId: 'DC_1', content: 'ROCKET', remove: true }, { cookie, 'x-csrf-token': csrfToken });

    expect(Number(await env.DISCUSS_KV.get(`cache:version:${REPO.toLowerCase()}`))).toBe(before + 1);
  });

  it('renders a Markdown preview with the reader’s token', async () => {
    const fake = github();
    const { cookie, csrfToken } = await session();
    const response = await post(fake, '/api/markdown', { repo: REPO, text: '**bold**' }, { cookie, 'x-csrf-token': csrfToken });

    expect(await response.json()).toEqual({ html: '<p><strong>bold</strong></p>' });
    expect(fake.calls.at(-1)?.authorization).toBe('Bearer ghu_reader');
  });

  it.each([
    ['no session', async () => ({}), 401],
    ['no CSRF token', async () => ({ cookie: (await session()).cookie }), 403],
    ['an ORCID session (posts through spec 003)', async () => { const s = await session('orcid'); return { cookie: s.cookie, 'x-csrf-token': s.csrfToken }; }, 401],
  ])('refuses %s', async (_name, headers, status) => {
    const fake = github();
    const response = await post(fake, '/api/comments', { ...(await page()), body: 'x' }, await headers());

    expect(response.status).toBe(status);
    expect(fake.calls.filter((call) => call.path === '/graphql')).toEqual([]);
  });

  it('refuses a discussion id from another repository and invented pages', async () => {
    const { cookie, csrfToken } = await session();
    const headers = { cookie, 'x-csrf-token': csrfToken };

    expect((await post(github(), '/api/comments', { repo: REPO, discussionId: 'D_other', body: 'x' }, headers)).status).toBe(404);
    expect((await post(github(), '/api/comments', { ...(await page()), term: 'invented/thing', body: 'x' }, headers)).status).toBe(403);
  });

  it('refuses repositories outside the allow-list, empty comments and unknown reactions', async () => {
    const { cookie, csrfToken } = await session();
    const headers = { cookie, 'x-csrf-token': csrfToken };

    expect((await post(github(), '/api/comments', { repo: 'someone/blog', discussionId: 'D', body: 'x' }, headers)).status).toBe(403);
    expect((await post(github(), '/api/comments', { repo: REPO, discussionId: 'D_page', body: '   ' }, headers)).status).toBe(422);
    expect((await post(github(), '/api/reactions', { repo: REPO, subjectId: 'D_page', content: 'PARTY' }, headers)).status).toBe(422);
  });
});

describe('POST /api/discussions/ensure (#16)', () => {
  /** A page whose term is the canonical pathname of an existing IPL page. */
  async function realPage() {
    const term = `pt-BR/ensure-${Date.now()}-${unique++}`;
    await env.DISCUSS_KV.put(await mapKey(REPO, 'DIC_c', term), JSON.stringify({ id: 'D_page', number: 3 }));
    return { repo: REPO, categoryId: 'DIC_c', term, title: 'Página', backLink: `http://localhost:4000/${term}/` };
  }
  const site = (status: number) => github(status);

  it('returns the page discussion URL, only for the widget origin', async () => {
    const created = await post(site(200), '/api/discussions/ensure', await realPage(), { 'cf-connecting-ip': `203.0.113.${unique++ % 250}` });

    expect(await created.json()).toEqual({ number: 3, url: `https://github.com/${REPO}/discussions/3` });
    expect((await post(site(200), '/api/discussions/ensure', await realPage(), { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('refuses terms that are not the pathname of the page link, links outside IPL, and pages that do not exist', async () => {
    const ip = { 'cf-connecting-ip': `192.0.2.${unique++ % 250}` };
    const real = await realPage();

    expect((await post(site(200), '/api/discussions/ensure', { ...real, term: 'invented/term' }, ip)).status).toBe(403);
    expect((await post(site(200), '/api/discussions/ensure', { ...real, backLink: `https://evil.example/${real.term}/` }, ip)).status).toBe(403);
    expect((await post(site(404), '/api/discussions/ensure', await realPage(), ip)).status).toBe(404);
    expect((await post(site(301), '/api/discussions/ensure', await realPage(), ip)).status).toBe(404);
  });

  it('limits anonymous creation per IP', async () => {
    const ip = `198.51.100.${unique++ % 250}`;
    for (let index = 0; index < 10; index += 1) await post(site(200), '/api/discussions/ensure', await realPage(), { 'cf-connecting-ip': ip });

    expect((await post(site(200), '/api/discussions/ensure', await realPage(), { 'cf-connecting-ip': ip })).status).toBe(429);
  });
});
