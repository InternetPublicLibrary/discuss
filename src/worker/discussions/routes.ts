import { Hono } from 'hono';
import type { Env } from '../env';
import type { WebhookHandler } from '../webhook';
import { bumpCacheVersion, parseQuery, readDiscussion } from './read';

export function discussionRoutes(fetcher?: typeof fetch) {
  const routes = new Hono<{ Bindings: Env }>();
  routes.get('/discussions', async (c) => c.json(await readDiscussion(c, parseQuery(c), fetcher)));
  return routes;
}

/** discussion and discussion_comment events: drop the repository's cached reads so new comments show at once. */
export const invalidateOnChange: WebhookHandler = async (delivery, c) => {
  const repo = (delivery.payload as { repository?: { full_name?: string } }).repository?.full_name;
  if (!repo) return { status: 'ignored', reason: 'no repository' };
  await bumpCacheVersion(c.env.DISCUSS_KV, repo);
  return { status: 'cache-invalidated', repository: repo };
};
