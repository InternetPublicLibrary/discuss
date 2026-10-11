import { DurableObject } from 'cloudflare:workers';
import { digestHex } from '../../shared/digest';
import { isValidTerm } from '../../shared/terms';
import { isAllowedOrigin, loadAllowLists } from '../config';
import type { Env } from '../env';
import { AppError } from '../errors';
import { type GitHubApp, gitHubAppFromEnv } from '../github/client';
import { repositoryCategories, resolveCategory } from './categories';
import { repoRef, searchPhrase } from './read';

/**
 * Exactly one discussion per page (issue #10). Upstream decided on page load and looked discussions up with GitHub
 * search, which lags behind creation, so concurrent or quick first comments created duplicates. Here one Durable
 * Object per (repository, category, term) serialises find-or-create and remembers the number; reads also consult the
 * KV map written afterwards, so a discussion is found before search indexes it.
 */
export interface FindOrCreateInput {
  repo: string;
  categoryId: string;
  category?: string;
  term: string;
  title: string;
  description?: string;
  backLink: string;
}

export interface FoundDiscussion {
  id: string;
  number: number;
  created: boolean;
}

export const mapKey = async (repo: string, categoryId: string, term: string) => `map:${repo.toLowerCase()}:${categoryId}:${await digestHex(term)}`;

const SEARCH = `query($query: String!) { search(type: DISCUSSION first: 10 query: $query) { nodes { ... on Discussion { id number createdAt author { login } repository { nameWithOwner } } } } }`;

const CREATE = `mutation($input: CreateDiscussionInput!) { createDiscussion(input: $input) { discussion { id number } } }`;

export interface Trust {
  botLogin: string;
  legacyAuthors: string[];
  legacyCutoff: number | null;
}

/**
 * Anyone may open a discussion whose body copies an IPL page's hash. A discussion counts as the page's only when the
 * IPL App's bot wrote it, independent of which token ran the lookup; listed legacy authors (e.g. the upstream giscus
 * app, which other sites can drive) count only for discussions created before LEGACY_DISCUSSIONS_BEFORE.
 */
export async function trustFor(env: Pick<Env, 'TRUSTED_DISCUSSION_AUTHORS' | 'LEGACY_DISCUSSIONS_BEFORE'>, github: GitHubApp): Promise<Trust> {
  const cutoff = Date.parse(env.LEGACY_DISCUSSIONS_BEFORE ?? '');
  return {
    botLogin: (await github.botLogin()).toLowerCase(),
    legacyAuthors: (env.TRUSTED_DISCUSSION_AUTHORS ?? '').split(',').map((login) => login.trim().toLowerCase()).filter(Boolean),
    legacyCutoff: Number.isFinite(cutoff) ? cutoff : null,
  };
}

export function isTrustedDiscussion(node: { author?: { login: string } | null; createdAt?: string }, trust: Trust): boolean {
  const login = node.author?.login.toLowerCase();
  if (!login) return false;
  if (login === trust.botLogin) return true;
  const created = Date.parse(node.createdAt ?? '');
  return trust.legacyAuthors.includes(login) && trust.legacyCutoff !== null && Number.isFinite(created) && created < trust.legacyCutoff;
}

/** Plain text for the discussion body: no HTML or Markdown structure from page metadata, one paragraph, capped. */
const plain = (value: string, max: number) => value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function discussionBody(input: FindOrCreateInput, termHash: string, allowedOrigins: { origins: string[]; patterns: RegExp[]; repositories: string[] }): string {
  // Only a link to an allowed IPL page goes into the body; anything else is left out.
  let page = '';
  try {
    const url = new URL(input.backLink);
    if (isAllowedOrigin(url.origin, allowedOrigins) && !url.username && !url.password) page = `**Page:** <${url.href}>`;
  } catch {
    page = '';
  }
  return [
    plain(input.description ?? '', 500),
    page,
    `<!-- discuss-term: ${input.term.replace(/-->/g, '')} -->`,
    `<!-- sha1: ${termHash} -->`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function findOrCreateUnlocked(github: GitHubApp, kv: KVNamespace, input: FindOrCreateInput, env: Pick<Env, 'TRUSTED_DISCUSSION_AUTHORS' | 'LEGACY_DISCUSSIONS_BEFORE' | 'IPL_ALLOWED_ORIGINS' | 'IPL_ORIGIN_PATTERNS' | 'ALLOWED_REPOSITORIES' | 'ENVIRONMENT'>): Promise<FoundDiscussion> {
  if (!isValidTerm(input.term)) throw new AppError('EMPTY_TERM', 'The page has no valid discussion term.');
  const key = await mapKey(input.repo, input.categoryId, input.term);
  const known = await kv.get<{ id: string; number: number }>(key, 'json');
  if (known) return { ...known, created: false };

  const repository = repoRef(input.repo);
  const categories = await repositoryCategories(github, kv, repository);
  const category = resolveCategory(categories, input.categoryId, input.category);
  const termHash = await digestHex(input.term);

  // Re-check right before creating: the discussion may exist from before this map (created by upstream giscus).
  const search = `repo:${input.repo.toLowerCase()} category:${searchPhrase(category.name)} in:body ${searchPhrase(termHash)}`;
  type Node = { id: string; number: number; createdAt?: string; author?: { login: string } | null; repository?: { nameWithOwner: string } };
  const found = await github.graphql<{ search: { nodes: Node[] } }>(repository, SEARCH, { query: search });
  const trusted = await trustFor(env, github);
  const existing = found.search.nodes.find(
    (node) => isTrustedDiscussion(node, trusted) && node.repository?.nameWithOwner.toLowerCase() === input.repo.toLowerCase(),
  );
  if (existing) {
    const mapped = { id: existing.id, number: existing.number };
    await kv.put(key, JSON.stringify(mapped));
    return { ...mapped, created: false };
  }

  const created = await github.graphql<{ createDiscussion: { discussion: { id: string; number: number } } }>(repository, CREATE, {
    input: { repositoryId: categories.repositoryId, categoryId: category.id, title: plain(input.title, 250) || input.term, body: discussionBody(input, termHash, loadAllowLists(env as Env)) },
  });
  const discussion = created.createDiscussion.discussion;
  await kv.put(key, JSON.stringify(discussion));
  return { ...discussion, created: true };
}

/** One instance per mapping key: `blockConcurrencyWhile` lets exactly one find-or-create run at a time. */
export class DiscussionLock extends DurableObject<Env> {
  async findOrCreate(input: FindOrCreateInput): Promise<FoundDiscussion> {
    let result: FoundDiscussion | undefined;
    await this.ctx.blockConcurrencyWhile(async () => {
      result = await findOrCreateUnlocked(gitHubAppFromEnv(this.env), this.env.DISCUSS_KV, input, this.env);
    });
    if (!result) throw new AppError('INTERNAL', 'Discussion lookup did not complete.');
    return result;
  }
}

/** Find or create the page's discussion through its Durable Object. */
export async function findOrCreateDiscussion(env: Env, input: FindOrCreateInput): Promise<FoundDiscussion> {
  const key = await mapKey(input.repo, input.categoryId, input.term);
  const known = await env.DISCUSS_KV.get<{ id: string; number: number }>(key, 'json');
  if (known) return { ...known, created: false };
  return env.DISCUSSION_LOCK.get(env.DISCUSSION_LOCK.idFromName(key)).findOrCreate(input);
}

