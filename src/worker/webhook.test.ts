import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from './env';
import { handleError } from './errors';
import { verifySignature, type WebhookHandler, webhookRoute } from './webhook';

const SECRET = "It's a Secret to Everybody";

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `sha256=${[...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function setup(vars: Partial<Env> = { GITHUB_WEBHOOK_SECRET: SECRET }) {
  const handler = vi.fn<WebhookHandler>(async () => ({ status: 'handled' }));
  const app = new Hono<{ Bindings: Env }>();
  app.onError(handleError);
  app.post('/v1/webhook', webhookRoute({ discussion: handler }));
  const deliver = (body: string, headers: Record<string, string>) =>
    app.request('/v1/webhook', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }, { ...env, ...vars });
  return { handler, deliver };
}

let deliveryCounter = 0;
const deliveryId = () => `delivery-${Date.now()}-${deliveryCounter++}`;
const payload = JSON.stringify({ action: 'closed', number: 1 });

describe('verifySignature', () => {
  it('matches GitHub’s documented example', async () => {
    // https://docs.github.com/webhooks/using-webhooks/validating-webhook-deliveries#testing-the-webhook-payload-validation
    const body = new TextEncoder().encode('Hello, World!').buffer as ArrayBuffer;

    await expect(verifySignature(SECRET, body, 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17')).resolves.toBe(true);
  });

  it.each([null, '', 'sha1=abc', 'sha256=zz', `sha256=${'0'.repeat(64)}`])('rejects the header %j', async (header) => {
    await expect(verifySignature(SECRET, new ArrayBuffer(0), header)).resolves.toBe(false);
  });
});

describe('POST /v1/webhook', () => {
  it('rejects a delivery without a signature with 401 and does no work', async () => {
    const { deliver, handler } = setup();
    const response = await deliver(payload, { 'x-github-event': 'discussion', 'x-github-delivery': deliveryId() });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_SIGNATURE' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a delivery signed with another secret', async () => {
    const { deliver, handler } = setup();
    const response = await deliver(payload, { 'x-github-event': 'discussion', 'x-github-delivery': deliveryId(), 'x-hub-signature-256': await sign(payload, 'wrong') });

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('checks the signature before parsing: a forged non-JSON body is 401, not 400', async () => {
    const { deliver } = setup();

    expect((await deliver('{not json', { 'x-github-event': 'discussion', 'x-hub-signature-256': await sign('other') })).status).toBe(401);
  });

  it('processes a correctly signed discussion delivery', async () => {
    const { deliver, handler } = setup();
    const id = deliveryId();
    const body = JSON.stringify({ action: 'closed', number: 3 });
    const response = await deliver(body, { 'x-github-event': 'discussion', 'x-github-delivery': id, 'x-hub-signature-256': await sign(body) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivery: id, status: 'handled' });
    expect(handler).toHaveBeenCalledWith({ id, event: 'discussion', payload: { action: 'closed', number: 3 } }, expect.anything());
  });

  it('ignores a replayed delivery id', async () => {
    const { deliver, handler } = setup();
    const payload = JSON.stringify({ action: 'closed', number: Date.now() + 1 });
    const headers = { 'x-github-event': 'discussion', 'x-github-delivery': deliveryId(), 'x-hub-signature-256': await sign(payload) };
    await deliver(payload, headers);
    const replay = await deliver(payload, headers);

    expect(await replay.json()).toMatchObject({ status: 'duplicate' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores a captured delivery replayed under a new delivery id', async () => {
    const { deliver, handler } = setup();
    const body = JSON.stringify({ action: 'closed', number: Date.now() });
    const signature = await sign(body);
    await deliver(body, { 'x-github-event': 'discussion', 'x-github-delivery': deliveryId(), 'x-hub-signature-256': signature });
    const replay = await deliver(body, { 'x-github-event': 'discussion', 'x-github-delivery': deliveryId(), 'x-hub-signature-256': signature.toUpperCase().replace('SHA256=', 'sha256=') });

    expect(await replay.json()).toMatchObject({ status: 'duplicate' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('answers events it does not subscribe to with 204', async () => {
    const { deliver, handler } = setup();
    const response = await deliver(payload, { 'x-github-event': 'push', 'x-github-delivery': deliveryId(), 'x-hub-signature-256': await sign(payload) });

    expect(response.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers ping', async () => {
    const { deliver } = setup();
    const response = await deliver('{"zen":"Keep it logically awesome."}', { 'x-github-event': 'ping', 'x-hub-signature-256': await sign('{"zen":"Keep it logically awesome."}') });

    expect(await response.json()).toEqual({ status: 'pong' });
  });

  it('rejects signed form-encoded deliveries with 415', async () => {
    const { deliver } = setup();
    const body = 'payload=%7B%7D';
    const response = await deliver(body, { 'content-type': 'application/x-www-form-urlencoded', 'x-github-event': 'discussion', 'x-hub-signature-256': await sign(body) });

    expect(response.status).toBe(415);
  });

  it('fails closed without a configured secret', async () => {
    const { deliver, handler } = setup({});
    const response = await deliver(payload, { 'x-github-event': 'discussion', 'x-hub-signature-256': await sign(payload) });

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('redelivery after a failure', () => {
  it('processes GitHub’s retry of a delivery whose handler failed', async () => {
    let attempts = 0;
    const handler = vi.fn<WebhookHandler>(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('GitHub was down');
      return { status: 'handled' };
    });
    const app = new Hono<{ Bindings: Env }>();
    app.onError(handleError);
    app.post('/v1/webhook', webhookRoute({ discussion: handler }));
    const body = JSON.stringify({ action: 'closed', number: Date.now() + 7 });
    const headers = { 'content-type': 'application/json', 'x-github-event': 'discussion', 'x-github-delivery': deliveryId(), 'x-hub-signature-256': await sign(body) };
    const deliver = () => app.request('/v1/webhook', { method: 'POST', body, headers }, { ...env, GITHUB_WEBHOOK_SECRET: SECRET });

    expect((await deliver()).status).toBe(500);
    const retry = await deliver();
    expect(await retry.json()).toMatchObject({ status: 'handled' });
    expect(await (await deliver()).json()).toMatchObject({ status: 'duplicate' });
  });
});
