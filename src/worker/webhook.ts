import type { Context } from 'hono';
import type { Env } from './env';
import { AppError, log } from './errors';

/**
 * POST /v1/webhook — GitHub App webhook (issue #5). Order matters: the signature is verified over the raw bytes
 * before anything is parsed, so an unsigned request can never cause work or a GitHub call.
 */
export const HANDLED_EVENTS = ['discussion', 'discussion_comment', 'installation'] as const;
export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export interface WebhookDelivery {
  id: string;
  event: HandledEvent;
  payload: Record<string, unknown>;
}

export type WebhookHandler = (delivery: WebhookDelivery, c: Context<{ Bindings: Env }>) => Promise<Record<string, unknown>>;

const DELIVERY_TTL_S = 24 * 60 * 60;

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}

/** Constant-time check of `X-Hub-Signature-256` with Web Crypto HMAC verify. */
export async function verifySignature(secret: string, body: ArrayBuffer, header: string | null): Promise<boolean> {
  const signature = header?.startsWith('sha256=') ? hexToBytes(header.slice('sha256='.length)) : null;
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature, body);
}

export function webhookRoute(handlers: Partial<Record<HandledEvent, WebhookHandler>>) {
  return async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    const secret = c.env.GITHUB_WEBHOOK_SECRET;
    // Fail closed: without a secret no delivery can be trusted.
    if (!secret) throw new AppError('NOT_CONFIGURED', 'GITHUB_WEBHOOK_SECRET is not set.');

    const body = await c.req.raw.arrayBuffer();
    const signature = c.req.header('x-hub-signature-256') ?? null;
    if (!(await verifySignature(secret, body, signature))) {
      throw new AppError('INVALID_SIGNATURE', 'The webhook signature is missing or invalid.');
    }

    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Configure the webhook to send application/json.');
    }

    const event = c.req.header('x-github-event') ?? '';
    if (event === 'ping') return c.json({ status: 'pong' });
    if (!(HANDLED_EVENTS as readonly string[]).includes(event)) return c.body(null, 204);

    const id = c.req.header('x-github-delivery') ?? '';
    if (!id) throw new AppError('BAD_REQUEST', 'X-GitHub-Delivery is missing.');
    // The delivery id is not covered by the signature, so a captured delivery could be replayed under a new id;
    // the signature (an HMAC of the exact body) is remembered too. GitHub payloads carry timestamps, so a
    // legitimate new event never repeats a body byte for byte. KV is eventually consistent: this guard is best
    // effort, and handlers are idempotent on their own.
    const replayKeys = [`webhook:delivery:${id}`, `webhook:signature:${(signature ?? '').toLowerCase()}`];
    const seen = await Promise.all(replayKeys.map((key) => c.env.DISCUSS_KV.get(key)));
    if (seen.some(Boolean)) return c.json({ status: 'duplicate', delivery: id });

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new AppError('INVALID_JSON', 'The webhook body is not valid JSON.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AppError('INVALID_JSON', 'The webhook body must be a JSON object.');
    }

    const handler = handlers[event as HandledEvent];
    const result = handler
      ? await handler({ id, event: event as HandledEvent, payload: payload as Record<string, unknown> }, c)
      : { status: 'ignored' };
    // Remembered only after the handler succeeded: if it throws, GitHub's retry or "Redeliver" (same id and body)
    // must be processed, not dismissed as a duplicate.
    await Promise.all(replayKeys.map((key) => c.env.DISCUSS_KV.put(key, '1', { expirationTtl: DELIVERY_TTL_S })));
    log('info', c, { webhook: event, delivery: id, ...result });
    return c.json({ delivery: id, ...result });
  };
}
