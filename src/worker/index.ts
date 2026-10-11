import { Hono } from 'hono';
import { authRoutes } from './auth/routes';
import { originGuard } from './config';
import type { Env } from './env';
import { discussionRoutes, invalidateOnChange } from './discussions/routes';
import { orcidRoutes } from './discussions/orcid';
import { writeRoutes } from './discussions/writes';
import { handleError, handleNotFound } from './errors';
import { webhookRoute } from './webhook';
import { serveWidget } from './widget';

export const app = new Hono<{ Bindings: Env }>();

app.onError(handleError);
app.notFound(handleNotFound);
app.use('/api/*', originGuard());

app.get('/api/health', (c) => c.json({ service: 'discuss', environment: c.env.ENVIRONMENT }));

app.get('/widget', serveWidget);
// The widget document exists only at /widget, where its CSP and frame-ancestors are set; never as a bare asset.
app.get('/', (c) => c.redirect('/widget', 302));
app.get('/index.html', (c) => c.redirect('/widget', 302));
app.route('/api', authRoutes());
app.route('/api', discussionRoutes());
app.route('/api', writeRoutes());
app.route('/api', orcidRoutes());
app.post('/api/webhook', webhookRoute({ discussion: invalidateOnChange, discussion_comment: invalidateOnChange }));

export { DiscussionLock } from './discussions/find-or-create';
export default app;
