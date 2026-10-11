import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment as CommentData, Reply } from '../../shared/types';
import { I18nProvider, loadMessages } from '../lib/i18n';
import { Comment } from './Comment';

const reply = (n: number): Reply => ({
  id: `R${n}`, author: { avatarUrl: 'a', login: 'reader', url: 'u' }, viewerDidAuthor: false, createdAt: '2026-10-01T00:00:00Z', url: `u#${n}`,
  authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: `<p>reply ${n}</p>`, reactions: {} as Reply['reactions'], replyToId: 'C1',
});

const comment: CommentData = {
  id: 'C1', author: { avatarUrl: 'a', login: 'reader', url: 'u' }, viewerDidAuthor: false, createdAt: '2026-10-01T00:00:00Z', url: 'u',
  authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>c</p>', reactions: {} as CommentData['reactions'],
  upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 150,
  replies: Array.from({ length: 100 }, (_v, index) => reply(index + 51)), repliesStartCursor: 'cursor-51',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Comment with more than 100 replies (#22)', () => {
  it('shows the first page and loads the remaining replies', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ totalCount: 150, replies: Array.from({ length: 50 }, (_v, index) => reply(index + 1)), startCursor: null }),
    );
    const messages = await loadMessages('en');
    const root = document.createElement('div');
    render(
      <I18nProvider locale="en" messages={messages} fallback={messages}>
        <Comment comment={comment} repo="o/r" />
      </I18nProvider>,
      root,
    );

    expect(root.textContent).toContain('150 replies');
    expect(root.querySelectorAll('.gsc-reply')).toHaveLength(5);
    const show = [...root.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Show'));
    show?.click();
    await vi.waitFor(() => expect(root.querySelectorAll('.gsc-reply')).toHaveLength(100));
    const load = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Load 50 earlier replies');
    load?.click();

    await vi.waitFor(() => expect(root.querySelectorAll('.gsc-reply')).toHaveLength(150));
    expect(String(fetch.mock.calls[0]?.[0])).toBe('/api/comments/replies?repo=o%2Fr&comment=C1&before=cursor-51');
    expect(root.querySelector('.gsc-reply')?.textContent).toContain('reply 1');
  });
});
