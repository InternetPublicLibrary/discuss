import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ service: 'discuss', environment: c.env.ENVIRONMENT }));

export default app;
