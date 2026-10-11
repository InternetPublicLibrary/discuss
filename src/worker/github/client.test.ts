import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { createAppJwt, importAppPrivateKey } from './app-jwt';
import { GitHubApp, type RepositoryRef } from './client';

let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

let counter = 0;
const repo = (): RepositoryRef => ({ owner: 'InternetPublicLibrary', repo: `pt-BR-${Date.now()}-${counter++}` });
const app = (fake: FakeGitHub, now?: () => number) =>
  new GitHubApp({ appId: '1', privateKey: pem, kv: env.DISCUSS_KV, fetch: fake.fetch, ...(now ? { now } : {}) });

describe('App authentication', () => {
  it('rejects PKCS#1 keys with conversion instructions', async () => {
    await expect(importAppPrivateKey('-----BEGIN RSA PRIVATE KEY-----\nx\n-----END RSA PRIVATE KEY-----')).rejects.toMatchObject({
      message: expect.stringContaining('openssl pkcs8'),
    });
  });

  it('signs a JWT with the App id', async () => {
    const jwt = await createAppJwt('42', await importAppPrivateKey(pem), 1_800_000_000);

    expect(JSON.parse(atob((jwt.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')))).toEqual({ iat: 1_799_999_940, exp: 1_800_000_540, iss: '42' });
  });

  it('reuses one installation token across requests until shortly before expiry (#9)', async () => {
    const fake = new FakeGitHub().withInstallation(91).on('POST', /^\/graphql$/, { data: { ok: true } });
    const repository = repo();

    await app(fake).graphql(repository, 'query { ok }', {});
    await app(fake, () => Date.now() + 30 * 60 * 1000).graphql(repository, 'query { ok }', {});

    expect(fake.count('POST', /access_tokens$/)).toBe(1);
  });

  it('reports a repository where the App is not installed as repo-not-found', async () => {
    const fake = new FakeGitHub().on('GET', /\/installation$/, new Response('{"message":"Not Found"}', { status: 404 }));

    await expect(app(fake).graphql(repo(), 'query { ok }', {})).rejects.toMatchObject({ code: 'REPO_NOT_FOUND', status: 404 });
  });
});

describe('graphql', () => {
  it('returns data', async () => {
    const fake = new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, { data: { viewer: { login: 'ipl-bot' } } });

    await expect(app(fake).graphql(repo(), 'query { viewer { login } }', {})).resolves.toEqual({ viewer: { login: 'ipl-bot' } });
    expect(fake.calls.at(-1)?.body).toEqual({ query: 'query { viewer { login } }', variables: {} });
  });

  it('turns a GraphQL RATE_LIMITED error (HTTP 200) into 503 rate-limited with Retry-After', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const fake = new FakeGitHub()
      .withInstallation()
      .on('POST', /^\/graphql$/, new Response(JSON.stringify({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for installation ID 1.' }] }), { headers: { 'x-ratelimit-reset': String(reset) } }));
    const error = await app(fake).graphql(repo(), 'query { ok }', {}).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'GITHUB_RATE_LIMITED', status: 503 });
    expect((error as { retryAfter: number }).retryAfter).toBeGreaterThan(590);
  });

  it('maps NOT_FOUND to repo-not-found', async () => {
    const fake = new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, { data: null, errors: [{ type: 'NOT_FOUND', path: ['repository'], message: "Could not resolve to a Repository with the name 'x'." }] });

    await expect(app(fake).graphql(repo(), 'query { ok }', {})).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });
  });

  it('maps a missing discussion to discussion-not-found', async () => {
    const fake = new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, { data: { repository: { discussion: null } }, errors: [{ type: 'NOT_FOUND', path: ['repository', 'discussion'], message: 'Could not resolve to a Discussion with the number of 9.' }] });

    await expect(app(fake).graphql(repo(), 'query { ok }', {})).rejects.toMatchObject({ code: 'DISCUSSION_NOT_FOUND', status: 404 });
  });

  it('uses a reader token when given and reports its expiry as signed-out', async () => {
    const fake = new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, new Response('{"message":"Bad credentials"}', { status: 401 }));

    await expect(app(fake).graphql(repo(), 'query { ok }', {}, 'ghu_reader')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(fake.calls.find((call) => call.path === '/graphql')?.authorization).toBe('Bearer ghu_reader');
    expect(fake.count('POST', /access_tokens$/)).toBe(0);
  });
});
