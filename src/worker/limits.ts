import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { AppError } from './errors';

/**
 * Exact rate limits (spec 003): one Durable Object per key counts within a fixed window, atomically — KV read-then-
 * write let parallel requests slip through.
 */
export class RateCounter extends DurableObject<Env> {
  async take(limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
    const now = Date.now();
    const state = (await this.ctx.storage.get<{ start: number; count: number }>('window')) ?? { start: now, count: 0 };
    const current = now - state.start >= windowSeconds * 1000 ? { start: now, count: 0 } : state;
    const retryAfter = Math.max(1, Math.ceil((current.start + windowSeconds * 1000 - now) / 1000));
    if (current.count >= limit) return { allowed: false, retryAfter };
    await this.ctx.storage.put('window', { start: current.start, count: current.count + 1 });
    return { allowed: true, retryAfter };
  }
}

export async function takeOrThrow(env: Env, key: string, limit: number, windowSeconds: number, message: string): Promise<void> {
  const counter = env.RATE_COUNTER.get(env.RATE_COUNTER.idFromName(key));
  const { allowed, retryAfter } = await counter.take(limit, windowSeconds);
  if (!allowed) throw new AppError('RATE_LIMITED', message, { limit: key.split(':')[0] }, retryAfter);
}
