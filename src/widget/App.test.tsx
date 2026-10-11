import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { readConfig } from './lib/config';

const discussionPage = {
  viewer: null,
  discussion: {
    id: 'D_1', number: 7, url: 'https://github.com/x/discussions/7', locked: false, totalCommentCount: 1, totalReplyCount: 0,
    pageInfo: { startCursor: null, hasNextPage: false, hasPreviousPage: false, endCursor: null }, repository: { nameWithOwner: 'o/r' },
    reactionCount: 0, reactions: {},
    comments: [{
      id: 'C1', author: { avatarUrl: 'https://avatars.githubusercontent.com/u/1', login: 'reader', url: 'https://github.com/reader' }, viewerDidAuthor: false,
      createdAt: '2026-10-01T00:00:00Z', url: 'https://github.com/x#C1', authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false,
      minimizedReason: null, bodyHTML: '<p>Ótimo <a href="https://example.org">recurso</a><img src=x onerror="alert(1)"></p>', reactions: {},
      upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null,
    }],
  },
};


afterEach(() => {
  vi.restoreAllMocks();
});

/** fetch mock routed by path: no session unless given, `discussions` for the discussion reads. */
function api(discussions: () => Response, session?: () => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/session')) return session ? session() : Response.json({ error: { reason: 'signed-out' } }, { status: 401 });
    return discussions();
  });
}

describe('App', () => {
  it('reads the embed configuration', () => {
    expect(readConfig('?repo=o/r&term=pt-BR/x&strict=1&origin=https://ipl.example/pt-BR/x/&lang=pt-BR&inputPosition=top')).toMatchObject({
      repo: 'o/r', term: 'pt-BR/x', strict: true, parentOrigin: 'https://ipl.example', lang: 'pt-BR', inputPosition: 'top',
    });
  });

  it('renders comments with sanitised HTML and safe links', async () => {
    api(() => Response.json(discussionPage));
    const root = document.createElement('div');
    render(<App config={readConfig('?repo=o/r&term=x')} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain('1 comment'));

    expect(root.querySelector('img[onerror]')).toBeNull();
    expect(root.querySelector('.markdown a')?.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
    expect(root.querySelector('.markdown a')?.getAttribute('target')).toBe('_top');
  });

  it('shows a translated message for an error reason', async () => {
    api(() => Response.json({ error: { code: 'GITHUB_RATE_LIMITED', reason: 'rate-limited', message: 'x' } }, { status: 503 }));
    const root = document.createElement('div');
    render(<App config={readConfig('?repo=o/r&term=x')} />, root);
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toBe('Comments are temporarily unavailable. Please try again later.'));
  });

  it('treats a page without a discussion as empty, not as an error', async () => {
    api(() => Response.json({ error: { code: 'DISCUSSION_NOT_FOUND', reason: 'discussion-not-found', message: 'x' } }, { status: 404 }));
    const root = document.createElement('div');
    render(<App config={readConfig('?repo=o/r&term=x')} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain('No comments yet'));
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('says so when the page has no term', async () => {
    const root = document.createElement('div');
    render(<App config={readConfig('?repo=o/r')} />, root);
    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toBe('Comments are not configured for this page.'));
  });
});

describe('settings from the IPL page (#12)', () => {
  it('applies a theme sent by the embedding page and ignores other senders', async () => {
    api(() => Response.json(discussionPage));
    const root = document.createElement('div');
    render(<App config={readConfig('?repo=o/r&term=x&origin=https://ipl.example/pt-BR/x/')} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain('1 comment'));
    const themeLinks = () => [...document.head.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute('href'));

    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: window.parent, data: { discuss: { setConfig: { theme: 'dark' } } } }));
    expect(themeLinks()).not.toContain('/themes/dark.css');

    window.dispatchEvent(new MessageEvent('message', { origin: 'https://ipl.example', source: window.parent, data: { discuss: { setConfig: { theme: 'dark' } } } }));
    await vi.waitFor(() => expect(themeLinks()).toContain('/themes/dark.css'));
  });
});
