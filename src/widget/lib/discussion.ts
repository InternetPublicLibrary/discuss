import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Comment, DiscussionPage } from '../../shared/types';
import { ApiError, getJson } from './api';
import type { CommentOrder, WidgetConfig } from './config';

const PAGE = 15;

export interface DiscussionState {
  isLoading: boolean;
  isLoadingMore: boolean;
  error: ApiError | null;
  moreError: ApiError | null;
  page: DiscussionPage | null;
  /** Comments shown above the "load more" control, then below it. */
  frontComments: Comment[];
  backComments: Comment[];
  numHidden: number;
  loadMore: () => void;
  reload: () => void;
}

function query(config: WidgetConfig, pagination: Record<string, string | number>) {
  const params = new URLSearchParams({ repo: config.repo, ...(config.number ? { number: String(config.number) } : { term: config.term }) });
  if (config.category) params.set('category', config.category);
  if (config.categoryId) params.set('categoryId', config.categoryId);
  if (config.strict) params.set('strict', '1');
  for (const [key, value] of Object.entries(pagination)) params.set(key, String(value));
  return `/api/discussions?${params}`;
}

/**
 * Upstream giscus's "front/back" loading: the newest PAGE comments first, then the oldest ones on demand, with a
 * "load more" control between them; duplicates removed where both ends meet.
 */
export function useDiscussion(config: WidgetConfig, order: CommentOrder): DiscussionState {
  const [back, setBack] = useState<DiscussionPage | null>(null);
  const [front, setFront] = useState<DiscussionPage[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  // A failed "load more" keeps what is on screen and offers a retry, instead of replacing it with an error.
  const [moreError, setMoreError] = useState<ApiError | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const latest = await getJson<DiscussionPage>(query(config, { last: PAGE }));
      const first = latest.discussion.pageInfo.hasPreviousPage ? [await getJson<DiscussionPage>(query(config, { first: PAGE }))] : [];
      if (!active) return;
      setBack(latest);
      setFront(first);
    })()
      .catch((caught: unknown) => active && setError(caught instanceof ApiError ? caught : new ApiError(0, 'internal', String(caught))))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [config.repo, config.term, config.number, config.category, config.categoryId, config.strict, version]);

  const loadMore = useCallback(() => {
    const last = front.at(-1);
    if (!last?.discussion.pageInfo.hasNextPage || isLoadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    getJson<DiscussionPage>(query(config, { first: PAGE, after: last.discussion.pageInfo.endCursor ?? '' }))
      .then((page) => setFront((pages) => [...pages, page]))
      .catch((caught: unknown) => setMoreError(caught instanceof ApiError ? caught : new ApiError(0, 'internal', String(caught))))
      .finally(() => setLoadingMore(false));
  }, [config, front, isLoadingMore]);

  const backComments = back?.discussion.comments ?? [];
  const seen = new Set(backComments.map((comment) => comment.id));
  const frontComments = front.flatMap((page) => page.discussion.comments).filter((comment) => !seen.has(comment.id));
  const total = back?.discussion.totalCommentCount ?? 0;
  const numHidden = Math.max(0, total - backComments.length - frontComments.length);

  const ordered = order === 'newest'
    ? { frontComments: backComments.slice().reverse(), backComments: frontComments.slice().reverse() }
    : { frontComments, backComments };

  return { isLoading, isLoadingMore, error, moreError, page: back, ...ordered, numHidden, loadMore, reload: () => setVersion((value) => value + 1) };
}
