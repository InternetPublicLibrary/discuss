import { AppError } from '../errors';
import type { GitHubApp, RepositoryRef } from '../github/client';

export interface Category {
  id: string;
  name: string;
  emoji: string;
}
export interface RepositoryCategories {
  repositoryId: string;
  categories: Category[];
}

const CATEGORIES_QUERY = `query($owner: String! $name: String!) {
  repository(owner: $owner, name: $name) { id discussionCategories(first: 100) { nodes { id name emojiHTML } } }
}`;
const TTL_S = 60 * 60;

/**
 * Category emoji from GitHub's `emojiHTML`, old format (`<g-emoji …>💬</g-emoji>`) and new (`<div>💬</div>`) (#25).
 */
export function extractEmoji(emojiHTML: string | null | undefined): string {
  if (!emojiHTML) return '';
  const old = /<g-emoji[^>]*>(.*?)<\/g-emoji>/s.exec(emojiHTML)?.[1];
  if (old) return old.trim();
  return emojiHTML.replace(/<[^>]*>/g, '').trim();
}

/** The repository id and its discussion categories (cached an hour). */
export async function repositoryCategories(github: GitHubApp, kv: KVNamespace, repository: RepositoryRef): Promise<RepositoryCategories> {
  const key = `categories:${repository.owner}/${repository.repo}`.toLowerCase();
  const cached = await kv.get<RepositoryCategories>(key, 'json');
  if (cached) return cached;
  const data = await github.graphql<{ repository: { id: string; discussionCategories: { nodes: { id: string; name: string; emojiHTML: string | null }[] } } | null }>(
    repository,
    CATEGORIES_QUERY,
    { owner: repository.owner, name: repository.repo },
  );
  if (!data.repository) throw new AppError('REPO_NOT_FOUND', 'The repository could not be found.');
  const result = {
    repositoryId: data.repository.id,
    categories: data.repository.discussionCategories.nodes.map(({ id, name, emojiHTML }) => ({ id, name, emoji: extractEmoji(emojiHTML) })),
  };
  await kv.put(key, JSON.stringify(result), { expirationTtl: TTL_S });
  return result;
}

/** The category must belong to the repository and, when a name is given, match it (#10: no creation elsewhere). */
export function resolveCategory(categories: RepositoryCategories, categoryId: string, categoryName?: string): Category {
  const category = categories.categories.find((item) => item.id === categoryId);
  if (!category || (categoryName && category.name !== categoryName)) {
    throw new AppError('CATEGORY_MISMATCH', 'The discussion category does not match this repository.', { categoryId, category: categoryName ?? null });
  }
  return category;
}
