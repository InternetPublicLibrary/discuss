import { Hono } from 'hono';
import { originGuard } from './config';
import type { Env } from './env';
import { handleError, handleNotFound } from './errors';

export const app = new Hono<{ Bindings: Env }>();

app.onError(handleError);
app.notFound(handleNotFound);
app.use('/api/*', originGuard());

app.get('/api/health', (c) => c.json({ service: 'discuss', environment: c.env.ENVIRONMENT }));

export default app;
