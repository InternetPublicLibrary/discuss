import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment as CommentData } from '../../shared/types';
import { App } from '../App';
import { readConfig } from '../lib/config';

const comment = (overrides: Partial<CommentData>): CommentData => ({
  id: 'C1', author: { avatarUrl: 'a', login: 'reader', url: 'u' }, viewerDidAuthor: false, createdAt: '2026-10-01T00:00:00Z', url: 'u', authorAssociation: 'NONE',
  lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>visible</p>', reactions: {} as CommentData['reactions'],
  upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null, ...overrides,
});

function page(comments: CommentData[]) {
  return {
    viewer: null,
    discussion: { id: 'D', number: 1, url: 'u', locked: false, totalCommentCount: comments.length, totalReplyCount: 0, pageInfo: { startCursor: null, hasNextPage: false, hasPreviousPage: false, endCursor: null }, repository: { nameWithOwner: 'o/r' }, reactionCount: 0, reactions: {}, comments },
  };
}

async function show(query: string, comments: CommentData[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => (String(input).startsWith('/api/session') ? Response.json({}, { status: 401 }) : Response.json(page(comments))));
  const root = document.body.appendChild(document.createElement('div'));
  render(<App config={readConfig(query)} />, root);
  await vi.waitFor(() => expect(root.querySelector('.gsc-timeline')).not.toBeNull());
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('minimised comments (#18)', () => {
  const spam = comment({ id: 'C_spam', isMinimized: true, minimizedReason: 'spam', bodyHTML: '<p>BUY NOW</p>' });

  it('are collapsed with the moderator’s reason and their body is not rendered until shown', async () => {
    const root = await show('?repo=o/r&term=x', [spam, comment({})]);

    expect(root.textContent).toContain('Hidden by a moderator: spam.');
    expect(root.textContent).not.toContain('BUY NOW');
    const toggle = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Show comment');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('BUY NOW'));
  });

  it('are left out entirely with data-hidden-comments="omit"', async () => {
    const root = await show('?repo=o/r&term=x&hiddenComments=omit', [spam, comment({})]);

    expect(root.textContent).not.toContain('Hidden by a moderator');
    expect(root.querySelectorAll('article')).toHaveLength(1);
  });

  it('do not reveal an ORCID author while hidden', async () => {
    const orcid = comment({ id: 'C_o', isMinimized: true, minimizedReason: 'off-topic', author: { avatarUrl: 'a', login: 'ipl-discuss[bot]', url: 'u' }, orcidAuthor: { id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'x' } });
    const root = await show('?repo=o/r&term=x', [orcid]);

    expect(root.textContent).toContain('Hidden by a moderator: off-topic.');
    expect(root.textContent).not.toContain('Josiah Carberry');
    expect(root.textContent).not.toContain('ipl-discuss');
  });
});

describe('community guidelines link (#18)', () => {
  it('renders the configured link next to the comment box, https only', async () => {
    const root = await show('?repo=o/r&term=x&guidelinesUrl=https://ipl.example/pt-BR/politicas/', []);

    expect(root.querySelector('a[href="https://ipl.example/pt-BR/politicas/"]')?.textContent).toBe('Community guidelines');
  });

  it('defaults to the repository code of conduct and ignores unsafe links', async () => {
    const root = await show('?repo=o/r&term=x&guidelinesUrl=javascript:alert(1)', []);

    expect(root.querySelector('a[href="https://github.com/o/r/blob/HEAD/CODE_OF_CONDUCT.md"]')).not.toBeNull();
    expect(root.querySelector('a[href^="javascript"]')).toBeNull();
  });
});
