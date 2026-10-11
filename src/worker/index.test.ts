import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('GET /api/health', () => {
  it('identifies the service and its environment', async () => {
    const response = await app.request('/api/health', {}, env);

    expect(await response.json()).toEqual({ service: 'discuss', environment: 'development' });
  });
});
