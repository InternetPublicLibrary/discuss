import { Hono } from 'hono';
import type { Env } from './env';
import { handleError, handleNotFound } from './errors';

export const app = new Hono<{ Bindings: Env }>();

app.onError(handleError);
app.notFound(handleNotFound);

app.get('/api/health', (c) => c.json({ service: 'discuss', environment: c.env.ENVIRONMENT }));

export default app;
