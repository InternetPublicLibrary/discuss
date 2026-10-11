import { Hono } from 'hono';
import { assertRepositoryAllowed, loadAllowLists } from '../config';
import type { Env } from '../env';
import { gitHubAppFromEnv } from '../github/client';
import { repositoryCategories } from './categories';
import type { WebhookHandler } from '../webhook';
import { bumpCacheVersion, parseQuery, readDiscussion, repoRef } from './read';

export function discussionRoutes(fetcher?: typeof fetch) {
  const routes = new Hono<{ Bindings: Env }>();
  routes.get('/discussions', async (c) => c.json(await readDiscussion(c, parseQuery(c), fetcher)));
  // Repository id and categories with emoji, for the configuration page and embed checks (#25).
  routes.get('/discussions/categories', async (c) => {
    const repo = assertRepositoryAllowed(c.req.query('repo'), loadAllowLists(c.env));
    return c.json(await repositoryCategories(gitHubAppFromEnv(c.env, fetcher), c.env.DISCUSS_KV, repoRef(repo)));
  });
  return routes;
}

/** discussion and discussion_comment events: drop the repository's cached reads so new comments show at once. */
export const invalidateOnChange: WebhookHandler = async (delivery, c) => {
  const repo = (delivery.payload as { repository?: { full_name?: string } }).repository?.full_name;
  if (!repo) return { status: 'ignored', reason: 'no repository' };
  await bumpCacheVersion(c.env.DISCUSS_KV, repo);
  return { status: 'cache-invalidated', repository: repo };
};
