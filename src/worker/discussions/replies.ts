import type { Context } from 'hono';
import { digestHex } from '../../shared/digest';
import type { Reply } from '../../shared/types';
import { assertRepositoryAllowed, loadAllowLists } from '../config';
import type { Env } from '../env';
import { AppError } from '../errors';
import { gitHubAppFromEnv } from '../github/client';
import { adaptReply, type GReply } from './adapt';
import { COMMENT_REPLIES } from './graphql';
import { markOrcid } from './orcid';
import { CACHE_TTL_S, limitUncachedReads, repoRef } from './read';

export interface RepliesPage {
  totalCount: number;
  replies: Reply[];
  /** Cursor for the next older page, or null when the first reply is included. */
  startCursor: string | null;
}

interface RepliesData {
  node: {
    discussion?: { repository: { nameWithOwner: string } };
    replies?: { totalCount: number; pageInfo: { hasPreviousPage: boolean; startCursor: string | null }; nodes: GReply[] };
  } | null;
}

/** GET /api/comments/replies?repo&comment&before — 100 older replies at a time, so no reply is out of reach (#22). */
export async function readReplies(c: Context<{ Bindings: Env }>, fetcher?: typeof fetch): Promise<RepliesPage> {
  const repo = assertRepositoryAllowed(c.req.query('repo'), loadAllowLists(c.env));
  const comment = c.req.query('comment') ?? '';
  const before = c.req.query('before') ?? '';
  if (!/^[A-Za-z0-9_=-]{1,100}$/.test(comment) || before.length > 200) throw new AppError('BAD_REQUEST', 'Invalid comment or cursor.');

  const kv = c.env.DISCUSS_KV;
  const version = (await kv.get(`cache:version:${repo.toLowerCase()}`)) ?? '0';
  const key = `cache:replies:${repo.toLowerCase()}:${version}:${await digestHex(`${comment}:${before}`, 'SHA-256')}`;
  const cached = await kv.get<RepliesPage>(key, 'json');
  if (cached) return cached;
  await limitUncachedReads(c);

  const github = gitHubAppFromEnv(c.env, fetcher);
  const data = await github.graphql<RepliesData>(repoRef(repo), COMMENT_REPLIES, { id: comment, before: before || null });
  const node = data.node;
  // The node id is client-supplied: it must be a comment of a discussion in the requested (allowed) repository.
  if (!node?.replies || node.discussion?.repository.nameWithOwner.toLowerCase() !== repo.toLowerCase()) {
    throw new AppError('DISCUSSION_NOT_FOUND', 'This comment could not be found.');
  }
  const bot = await github.botLogin();
  const page: RepliesPage = {
    totalCount: node.replies.totalCount,
    replies: node.replies.nodes.map(adaptReply).map((reply) => markOrcid(reply, bot)),
    startCursor: node.replies.pageInfo.hasPreviousPage ? node.replies.pageInfo.startCursor : null,
  };
  await kv.put(key, JSON.stringify(page), { expirationTtl: CACHE_TTL_S });
  return page;
}
