import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { digestHex } from '../../shared/digest';
import { GitHubApp } from '../github/client';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { extractEmoji } from './categories';
import { findOrCreateDiscussion, findOrCreateUnlocked, type FindOrCreateInput } from './find-or-create';

let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});
afterEach(() => {
  vi.restoreAllMocks();
  // The concurrency test hands the App credentials to the Durable Object through the shared env.
  Reflect.deleteProperty(env, 'GITHUB_APP_ID');
  Reflect.deleteProperty(env, 'GITHUB_APP_PRIVATE_KEY');
});

let counter = 0;
const input = (overrides: Partial<FindOrCreateInput> = {}): FindOrCreateInput => ({
  repo: `InternetPublicLibrary/sandbox-${Date.now()}-${counter++}`,
  categoryId: 'DIC_comments',
  category: 'Comments',
  term: 'pt-BR/computacao/ciência-de-dados',
  title: 'Ciência de Dados — IPL',
  description: 'Recursos <b>curados</b> de ciência de dados.',
  backLink: 'http://localhost:4000/pt-BR/computacao/ciencia-de-dados/',
  ...overrides,
});

const CATEGORIES = { data: { repository: { id: 'R_1', discussionCategories: { nodes: [{ id: 'DIC_comments', name: 'Comments', emojiHTML: '<div>💬</div>' }] } } } };

function github(options: { existing?: boolean; spoofed?: boolean; createDelayMs?: number } = {}) {
  let number = 100;
  return new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, async (call) => {
    const { query } = call.body as { query: string };
    if (query.includes('discussionCategories')) return Response.json(CATEGORIES);
    if (query.includes('search(')) {
      const repo = (call.body as { variables: { query: string } }).variables.query.split(' ')[0]?.slice('repo:'.length) ?? '';
      const nodes = [
        ...(options.spoofed ? [{ id: 'D_evil', number: 6, viewerDidAuthor: false, author: { login: 'mallory' }, repository: { nameWithOwner: repo } }] : []),
        ...(options.existing ? [{ id: 'D_old', number: 5, viewerDidAuthor: true, author: { login: 'ipl-discuss[bot]' }, repository: { nameWithOwner: repo } }] : []),
      ];
      return Response.json({ data: { search: { nodes } } });
    }
    if (query.includes('createDiscussion')) {
      if (options.createDelayMs) await new Promise((resolve) => setTimeout(resolve, options.createDelayMs));
      number += 1;
      return Response.json({ data: { createDiscussion: { discussion: { id: `D_${number}`, number } } } });
    }
    return Response.json({ errors: [{ message: 'unexpected' }] });
  });
}
const creates = (fake: FakeGitHub) => fake.calls.filter((call) => (call.body as { query?: string } | undefined)?.query?.includes('createDiscussion'));
const app = (fake: FakeGitHub) => new GitHubApp({ appId: '1', privateKey: pem, kv: env.DISCUSS_KV, fetch: fake.fetch });

describe('find-or-create (#10, #11)', () => {
  it('creates one discussion titled with the page title, keyed by the term hash in the body', async () => {
    const fake = github();
    const page = input();
    const result = await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, page, env);
    const variables = (creates(fake)[0]?.body as { variables: { input: { title: string; body: string; categoryId: string; repositoryId: string } } }).variables.input;

    expect(result).toEqual({ id: 'D_101', number: 101, created: true });
    expect(variables).toMatchObject({ title: 'Ciência de Dados — IPL', categoryId: 'DIC_comments', repositoryId: 'R_1' });
    expect(variables.body).toContain(`<!-- sha1: ${await digestHex(page.term)} -->`);
    expect(variables.body).toContain('<!-- discuss-term: pt-BR/computacao/ciência-de-dados -->');
    expect(variables.body).toContain('**Page:** <http://localhost:4000/pt-BR/computacao/ciencia-de-dados/>');
    expect(variables.body).not.toContain('<b>');
  });

  it('returns the same discussion afterwards without searching or creating again (KV map)', async () => {
    const fake = github();
    const page = input();
    await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, page, env);
    const before = fake.calls.length;
    const again = await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, page, env);

    expect(again).toEqual({ id: 'D_101', number: 101, created: false });
    expect(fake.calls.length).toBe(before);
  });

  it('finds a discussion that already exists before creating', async () => {
    const fake = github({ existing: true });

    await expect(findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input(), env)).resolves.toEqual({ id: 'D_old', number: 5, created: false });
    expect(creates(fake)).toEqual([]);
  });

  it('ignores a discussion someone else opened with the page hash and creates the App\u2019s own', async () => {
    const fake = github({ spoofed: true });

    await expect(findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input(), env)).resolves.toMatchObject({ number: 101, created: true });
  });

  it('leaves a back link outside the allowed origins out of the body', async () => {
    const fake = github();
    await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input({ backLink: 'javascript:alert(1)' }), env);
    await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input({ backLink: 'https://evil.example/phish' }), env);
    const bodies = creates(fake).map((call) => (call.body as { variables: { input: { body: string } } }).variables.input.body);

    expect(bodies.join('\n')).not.toMatch(/Page:|javascript|evil/);
  });

  it('keeps the same discussion when the page title changes (matched by term, not title)', async () => {
    const fake = github();
    const page = input();
    await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, page, env);

    await expect(findOrCreateUnlocked(app(fake), env.DISCUSS_KV, { ...page, title: 'Novo título' }, env)).resolves.toMatchObject({ number: 101, created: false });
    expect(creates(fake)).toHaveLength(1);
  });

  it('refuses a category id that does not belong to the repository or does not match its name', async () => {
    const fake = github();

    await expect(findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input({ categoryId: 'DIC_other' }), env)).rejects.toMatchObject({ code: 'CATEGORY_MISMATCH', status: 422 });
    await expect(findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input({ category: 'Ideas' }), env)).rejects.toMatchObject({ code: 'CATEGORY_MISMATCH' });
    expect(creates(fake)).toEqual([]);
  });

  it('refuses an empty or multi-line term', async () => {
    await expect(findOrCreateUnlocked(app(github()), env.DISCUSS_KV, input({ term: '' }), env)).rejects.toMatchObject({ code: 'EMPTY_TERM' });
    await expect(findOrCreateUnlocked(app(github()), env.DISCUSS_KV, input({ term: 'a\nb' }), env)).rejects.toMatchObject({ code: 'EMPTY_TERM' });
  });

  it('cannot close the hidden term comment from the term', async () => {
    const fake = github();
    await findOrCreateUnlocked(app(fake), env.DISCUSS_KV, input({ term: 'a --> <script>' }), env);
    const body = (creates(fake)[0]?.body as { variables: { input: { body: string } } }).variables.input.body;

    expect(body).toContain('<!-- discuss-term: a  <script> -->');
  });
});

describe('concurrency through the Durable Object', () => {
  it('two simultaneous first comments create exactly one discussion', async () => {
    const fake = github({ createDelayMs: 50 });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fake.fetch);
    const vars = { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem };
    // The Durable Object reads its own env; give it the App credentials the same way production does.
    Object.assign(env, { GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem });
    const page = input();

    const [first, second] = await Promise.all([findOrCreateDiscussion(vars, page), findOrCreateDiscussion(vars, page)]);

    expect(creates(fake)).toHaveLength(1);
    expect(first?.number).toBe(second?.number);
    expect([first?.created, second?.created].sort()).toEqual([false, true]);
  });
});

describe('extractEmoji (#25)', () => {
  it.each([
    ['<div><g-emoji class="g-emoji" alias="speech_balloon" fallback-src="x">💬</g-emoji></div>', '💬'],
    ['<div>💬</div>', '💬'],
    ['', ''],
    [null, ''],
  ])('extracts the emoji from %j', (html, emoji) => {
    expect(extractEmoji(html)).toBe(emoji);
  });
});
