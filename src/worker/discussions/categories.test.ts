import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { handleError } from '../errors';
import { FakeGitHub, generateAppKey } from '../test/fake-github';
import { discussionRoutes } from './routes';

let pem: string;
beforeAll(async () => {
  ({ pem } = await generateAppKey());
});

describe('GET /api/discussions/categories', () => {
  it('returns the repository id and categories with emoji in old and new GitHub HTML', async () => {
    const fake = new FakeGitHub().withInstallation().on('POST', /^\/graphql$/, {
      data: {
        repository: {
          id: 'R_1',
          discussionCategories: {
            nodes: [
              { id: 'DIC_a', name: 'Comments', emojiHTML: '<div><g-emoji class="g-emoji" alias="speech_balloon">💬</g-emoji></div>' },
              { id: 'DIC_b', name: 'Ideas', emojiHTML: '<div>💡</div>' },
            ],
          },
        },
      },
    });
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api', discussionRoutes(fake.fetch));
    const response = await app.request('/api/discussions/categories?repo=InternetPublicLibrary/discuss-sandbox', {}, { ...env, GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: pem });

    expect(await response.json()).toEqual({
      repositoryId: 'R_1',
      categories: [
        { id: 'DIC_a', name: 'Comments', emoji: '💬' },
        { id: 'DIC_b', name: 'Ideas', emoji: '💡' },
      ],
    });
  });

  it('refuses repositories outside the allow-list', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.route('/api', discussionRoutes(new FakeGitHub().fetch));

    expect((await app.request('/api/discussions/categories?repo=someone/blog', {}, env)).status).toBe(403);
  });
});
