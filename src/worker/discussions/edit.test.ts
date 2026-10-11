import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { seal } from '../auth/crypto';
import { randomToken } from '../auth/pkce';
import { SESSION_COOKIE } from '../auth/sessions';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { orcidRoutes } from './orcid';
import { writeRoutes } from './writes';

const SELF = 'https://discuss.example';
const REPO = 'InternetPublicLibrary/discuss-sandbox';
const SECRET = 's'.repeat(40);
const ME = '0000-0002-1825-0097';
let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

async function session(provider: 'orcid' | 'github', id = ME) {
  const sid = randomToken();
  const csrfToken = randomToken();
  const identity = provider === 'orcid' ? { provider, id, name: 'Josiah Carberry', profileUrl: `https://orcid.org/${id}` } : { provider, id: '1', login: 'octocat', name: 'O', profileUrl: 'x' };
  await env.DISCUSS_KV.put(`session:${sid}`, JSON.stringify({ identity, csrfToken, createdAt: '', ...(provider === 'github' ? { github: await seal(SECRET, { accessToken: 'ghu_reader' }) } : {}) }));
  return { cookie: `${SESSION_COOKIE}=${sid}`, 'x-csrf-token': csrfToken };
}

/** A comment by the bot for iD ME (DC_mine), by the bot for someone else (DC_theirs), by a person (DC_human), elsewhere (DC_other). */
function github() {
  return new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, (call) => {
    const { query, variables } = call.body as { query: string; variables: { id?: string; input?: { commentId?: string; body?: string } } };
    if (query.includes('updateDiscussionComment')) return Response.json({ data: { updateDiscussionComment: { comment: { bodyHTML: `<p><strong>Josiah Carberry</strong> · <a href="https://orcid.org/${ME}">ORCID ${ME}</a> — via IPL discuss</p><p>novo</p>`, lastEditedAt: '2026-10-11T01:00:00Z' } } } });
    if (query.includes('deleteDiscussionComment')) return Response.json({ data: { deleteDiscussionComment: { comment: { id: variables.input } } } });
    const id = variables.id ?? '';
    const bodies: Record<string, { body: string; login: string; repo: string }> = {
      DC_mine: { body: `**J** · [ORCID ${ME}](x) — via IPL discuss\n\nold\n\n<!-- ipl-orcid:${ME} -->`, login: 'ipl-discuss[bot]', repo: REPO },
      DC_theirs: { body: 'x\n\n<!-- ipl-orcid:0000-0001-0000-0000 -->', login: 'ipl-discuss[bot]', repo: REPO },
      DC_human: { body: `x\n\n<!-- ipl-orcid:${ME} -->`, login: 'mallory', repo: REPO },
      DC_other: { body: `x\n\n<!-- ipl-orcid:${ME} -->`, login: 'ipl-discuss[bot]', repo: 'secret/private' },
    };
    const found = bodies[id];
    return Response.json({ data: { node: found ? { body: found.body, author: { login: found.login }, discussion: { repository: { nameWithOwner: found.repo } } } : null } });
  });
}

function call(fake: FakeGitHub, method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.route('/api', writeRoutes(fake.fetch));
  app.route('/api', orcidRoutes(fake.fetch));
  return app.request(`${SELF}${path}`, { method, headers: { origin: SELF, 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem, SESSION_SECRET: SECRET });
}
const mutations = (fake: FakeGitHub) => fake.calls.filter((item) => /update|delete/.test((item.body as { query?: string } | undefined)?.query ?? ''));

describe('editing and deleting ORCID comments (#19)', () => {
  it('lets the author edit their own comment, keeping the generated header and marker', async () => {
    const fake = github();
    const response = await call(fake, 'PATCH', '/api/orcid/comments/DC_mine', await session('orcid'), { repo: REPO, body: 'novo <!-- ipl-orcid:x -->' });

    expect(await response.json()).toEqual({ bodyHTML: '<p>novo</p>', lastEditedAt: '2026-10-11T01:00:00Z' });
    const sent = (mutations(fake)[0]?.body as { variables: { input: { body: string } } }).variables.input.body;
    expect(sent.startsWith(`**Josiah Carberry** · [ORCID ${ME}]`)).toBe(true);
    expect(sent.endsWith(`<!-- ipl-orcid:${ME} -->`)).toBe(true);
    expect(sent.match(/<!-- ipl-orcid:/g)).toHaveLength(1);
  });

  it('lets the author delete their own comment', async () => {
    const fake = github();

    expect((await call(fake, 'DELETE', `/api/orcid/comments/DC_mine?repo=${REPO}`, await session('orcid'))).status).toBe(204);
    expect(mutations(fake)).toHaveLength(1);
  });

  it.each(['DC_theirs', 'DC_human', 'DC_other'])('refuses another reader calling the API directly on %s (403, no mutation)', async (id) => {
    const fake = github();
    const headers = await session('orcid');

    expect((await call(fake, 'PATCH', `/api/orcid/comments/${id}`, headers, { repo: REPO, body: 'x' })).status).toBe(403);
    expect((await call(fake, 'DELETE', `/api/orcid/comments/${id}?repo=${REPO}`, headers)).status).toBe(403);
    expect(mutations(fake)).toEqual([]);
  });
});

describe('editing and deleting GitHub comments (#19)', () => {
  it('uses the reader’s own token, so GitHub enforces authorship', async () => {
    const fake = github().on('POST', /^\/graphql$/, { data: { node: { discussion: { repository: { nameWithOwner: REPO } } } } });
    const response = await call(fake, 'PATCH', '/api/comments/DC_human', await session('github'), { repo: REPO, body: 'fixed' });

    expect(response.status).toBe(200);
    expect(mutations(fake)[0]?.authorization).toBe('Bearer ghu_reader');
  });

  it('refuses comments from another repository', async () => {
    const fake = github();

    expect((await call(fake, 'DELETE', `/api/comments/DC_other?repo=${REPO}`, await session('github'))).status).toBe(404);
    expect(mutations(fake)).toEqual([]);
  });
});
