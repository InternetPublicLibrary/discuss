import { DurableObject } from 'cloudflare:workers';
import { digestHex } from '../../shared/digest';
import { isValidTerm } from '../../shared/terms';
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

const SEARCH = `query($query: String!) { search(type: DISCUSSION first: 1 query: $query) { nodes { ... on Discussion { id number } } } }`;
const CREATE = `mutation($input: CreateDiscussionInput!) { createDiscussion(input: $input) { discussion { id number } } }`;

/** Plain text for the discussion body: no HTML or Markdown structure from page metadata, one paragraph, capped. */
const plain = (value: string, max: number) => value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function discussionBody(input: FindOrCreateInput, termHash: string): string {
  return [
    plain(input.description ?? '', 500),
    `**Page:** ${input.backLink}`,
    `<!-- discuss-term: ${input.term.replace(/-->/g, '')} -->`,
    `<!-- sha1: ${termHash} -->`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function findOrCreateUnlocked(github: GitHubApp, kv: KVNamespace, input: FindOrCreateInput): Promise<FoundDiscussion> {
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
  const found = await github.graphql<{ search: { nodes: { id: string; number: number }[] } }>(repository, SEARCH, { query: search });
  const existing = found.search.nodes[0];
  if (existing) {
    await kv.put(key, JSON.stringify(existing));
    return { ...existing, created: false };
  }

  const created = await github.graphql<{ createDiscussion: { discussion: { id: string; number: number } } }>(repository, CREATE, {
    input: { repositoryId: categories.repositoryId, categoryId: category.id, title: plain(input.title, 250) || input.term, body: discussionBody(input, termHash) },
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
      result = await findOrCreateUnlocked(gitHubAppFromEnv(this.env), this.env.DISCUSS_KV, input);
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

