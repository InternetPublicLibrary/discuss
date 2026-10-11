import type { Context } from 'hono';
import { digestHex } from '../../shared/digest';
import type { DiscussionPage } from '../../shared/types';
import { assertRepositoryAllowed, loadAllowLists } from '../config';
import type { Env } from '../env';
import { AppError, log } from '../errors';
import { gitHubAppFromEnv, type RepositoryRef } from '../github/client';
import { adaptDiscussion, type GDiscussion } from './adapt';
import { isTrustedDiscussion, trustedAuthors } from './find-or-create';
import { DISCUSSION_BY_NUMBER, DISCUSSION_BY_SEARCH } from './graphql';

/** Anonymous reads are cached this long; webhook events for the repository invalidate them sooner (#9). */
export const CACHE_TTL_S = 300;
const LOW_BUDGET = 200;

export interface DiscussionQuery {
  repo: string;
  term?: string;
  number?: number;
  category?: string;
  categoryId?: string;
  strict: boolean;
  first?: number;
  last?: number;
  after?: string;
  before?: string;
}

const int = (value: string | undefined, max: number) => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new AppError('BAD_REQUEST', 'Invalid pagination value.');
  return parsed;
};

export function parseQuery(c: Context<{ Bindings: Env }>): DiscussionQuery {
  const repo = assertRepositoryAllowed(c.req.query('repo'), loadAllowLists(c.env));
  const term = (c.req.query('term') ?? '').trim();
  const number = int(c.req.query('number'), 1_000_000);
  if (!term && !number) throw new AppError('EMPTY_TERM', 'The page has no discussion term.');
  const first = int(c.req.query('first'), 100);
  const last = int(c.req.query('last'), 100);
  const after = c.req.query('after');
  const before = c.req.query('before');
  return {
    repo,
    ...(term ? { term } : {}),
    ...(number ? { number } : {}),
    ...(c.req.query('category') ? { category: c.req.query('category') ?? '' } : {}),
    ...(c.req.query('categoryId') ? { categoryId: c.req.query('categoryId') ?? '' } : {}),
    strict: c.req.query('strict') === 'true' || c.req.query('strict') === '1',
    ...(first || last ? {} : { first: 20 }),
    ...(first ? { first } : {}),
    ...(last ? { last } : {}),
    ...(after ? { after } : {}),
    ...(before ? { before } : {}),
  };
}

export const repoRef = (repo: string): RepositoryRef => {
  const [owner = '', name = ''] = repo.split('/');
  return { owner, repo: name };
};

/**
 * A value inside a quoted GitHub search term. GitHub's search syntax has no escape for `"`, so a quote or backslash
 * in the term could close the phrase and add qualifiers such as `repo:other/repo`; they are removed, as are control
 * characters.
 */
export function searchPhrase(value: string): string {
  return `"${value.replace(/["\\\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim()}"`;
}

const versionKey = (repo: string) => `cache:version:${repo.toLowerCase()}`;

/** Invalidate every cached read of a repository (called by the webhook on discussion events). */
export async function bumpCacheVersion(kv: KVNamespace, repo: string): Promise<void> {
  const current = Number((await kv.get(versionKey(repo))) ?? 0);
  await kv.put(versionKey(repo), String(current + 1));
}

async function cacheKey(kv: KVNamespace, query: DiscussionQuery): Promise<string> {
  const version = (await kv.get(versionKey(query.repo))) ?? '0';
  return `cache:discussion:${query.repo.toLowerCase()}:${version}:${await digestHex(JSON.stringify(query), 'SHA-256')}`;
}

interface SearchData {
  rateLimit?: { remaining: number; resetAt: string; cost: number };
  search: { discussionCount: number; nodes: GDiscussion[] };
}
interface NumberData {
  rateLimit?: { remaining: number; resetAt: string; cost: number };
  repository: { discussion: GDiscussion | null } | null;
}

/**
 * Read a discussion as the App. Anonymous results are cached in KV (one GitHub call per page per TTL); the
 * remaining GraphQL budget is logged when it runs low so maintainers see it before readers do.
 */
export async function readDiscussion(c: Context<{ Bindings: Env }>, query: DiscussionQuery, fetcher?: typeof fetch): Promise<DiscussionPage> {
  const kv = c.env.DISCUSS_KV;
  const key = await cacheKey(kv, query);
  const cached = await kv.get<DiscussionPage>(key, 'json');
  if (cached) return cached;

  const github = gitHubAppFromEnv(c.env, fetcher);
  const repository = repoRef(query.repo);
  const pagination = { first: query.first, last: query.last, after: query.after, before: query.before };
  let discussion: GDiscussion | null;
  let rateLimit: SearchData['rateLimit'];

  // A discussion created by this service is found through its KV map first, before GitHub search indexes it (#10).
  const mapped = !query.number && query.term && query.categoryId
    ? await kv.get<{ number: number }>(`map:${query.repo.toLowerCase()}:${query.categoryId}:${await digestHex(query.term)}`, 'json')
    : null;
  const number = query.number ?? mapped?.number;

  if (number) {
    const data = await github.graphql<NumberData>(repository, DISCUSSION_BY_NUMBER, { owner: repository.owner, name: repository.repo, number, ...pagination });
    discussion = data.repository?.discussion ?? null;
    rateLimit = data.rateLimit;
  } else {
    // Lower-case repo in the query: GitHub's search mismatches categories otherwise (upstream behaviour).
    const term = query.strict ? await digestHex(query.term ?? '') : (query.term ?? '');
    const search = [`repo:${query.repo.toLowerCase()}`, query.category ? `category:${searchPhrase(query.category)}` : '', query.strict ? 'in:body' : 'in:title', searchPhrase(term)]
      .filter(Boolean)
      .join(' ');
    const data = await github.graphql<SearchData>(repository, DISCUSSION_BY_SEARCH, { query: search, ...pagination });
    // Search can match a discussion anyone opened with a copied hash or title: only the App's (or trusted) count.
    const trusted = trustedAuthors(c.env);
    discussion = data.search.nodes.find((node) => isTrustedDiscussion(node, trusted)) ?? null;
    rateLimit = data.rateLimit;
  }

  // Defence in depth: never return a discussion from another repository, whatever the search matched.
  if (discussion && discussion.repository.nameWithOwner.toLowerCase() !== query.repo.toLowerCase()) discussion = null;
  if (rateLimit && rateLimit.remaining < LOW_BUDGET) log('warn', c, { github: 'rate-limit-low', remaining: rateLimit.remaining, resetAt: rateLimit.resetAt });
  if (!discussion) throw new AppError('DISCUSSION_NOT_FOUND', 'This page has no discussion yet.');

  const page: DiscussionPage = { viewer: null, discussion: adaptDiscussion(discussion) };
  await kv.put(key, JSON.stringify(page), { expirationTtl: CACHE_TTL_S });
  return page;
}
