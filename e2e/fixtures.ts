import type { Page } from '@playwright/test';

export const GITHUB = { identity: { provider: 'github', id: '1', login: 'octocat', name: 'The Octocat', profileUrl: 'https://github.com/octocat' }, csrfToken: 'csrf' };
export const ORCID = { identity: { provider: 'orcid', id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'https://orcid.org/0000-0002-1825-0097' }, csrfToken: 'csrf' };

const reactions = {
  THUMBS_UP: { count: 2, viewerHasReacted: true }, THUMBS_DOWN: { count: 0, viewerHasReacted: false }, LAUGH: { count: 0, viewerHasReacted: false },
  HOORAY: { count: 0, viewerHasReacted: false }, CONFUSED: { count: 0, viewerHasReacted: false }, HEART: { count: 1, viewerHasReacted: false },
  ROCKET: { count: 0, viewerHasReacted: false }, EYES: { count: 0, viewerHasReacted: false },
};
const avatar = 'https://avatars.githubusercontent.com/u/1';
const base = {
  viewerDidAuthor: false, authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null,
  reactions, upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null,
};

const reply = { ...base, id: 'R1', author: { avatarUrl: avatar, login: 'maintainer', url: 'https://github.com/maintainer' }, authorAssociation: 'MEMBER', createdAt: '2026-10-02T10:00:00Z', url: 'https://github.com/o/r/discussions/7#R1', bodyHTML: '<p>Thanks, added to the list.</p>', replyTo: { id: 'C1' } };

export const DISCUSSION = {
  viewer: null,
  discussion: {
    id: 'D_1', number: 7, url: 'https://github.com/o/r/discussions/7', locked: false, totalCommentCount: 3, totalReplyCount: 1,
    pageInfo: { startCursor: null, hasNextPage: false, hasPreviousPage: false, endCursor: null }, repository: { nameWithOwner: 'o/r' },
    reactionCount: 3, reactions,
    comments: [
      { ...base, id: 'C1', author: { avatarUrl: avatar, login: 'reader', url: 'https://github.com/reader' }, createdAt: '2026-10-01T09:00:00Z', url: 'https://github.com/o/r/discussions/7#C1', bodyHTML: '<p>A great <a href="https://example.org">resource</a> for <code>git</code>.</p>', replyCount: 1, replies: [reply] },
      { ...base, id: 'C2', author: { avatarUrl: avatar, login: 'ipl-discuss[bot]', url: 'https://github.com/apps/ipl-discuss' }, orcidAuthor: { id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'https://orcid.org/0000-0002-1825-0097' }, createdAt: '2026-10-03T09:00:00Z', url: 'https://github.com/o/r/discussions/7#C2', bodyHTML: '<p>Cited in my thesis.</p>' },
      { ...base, id: 'C3', author: { avatarUrl: avatar, login: 'spammer', url: 'https://github.com/spammer' }, createdAt: '2026-10-04T09:00:00Z', url: 'https://github.com/o/r/discussions/7#C3', bodyHTML: '<p>Buy now</p>', isMinimized: true, minimizedReason: 'spam' },
    ],
  },
};

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

/** Answer the widget's API and avatars locally; `session` is the signed-in identity, or null when signed out. */
export async function mockApi(page: Page, session: typeof GITHUB | typeof ORCID | null) {
  await page.route('https://avatars.githubusercontent.com/**', (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));
  await page.route('**/api/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/session') return session ? route.fulfill({ json: session }) : route.fulfill({ status: 401, json: { error: { reason: 'signed-out' } } });
    if (pathname.startsWith('/api/discussions')) return route.fulfill({ json: { ...DISCUSSION, viewer: session ? { login: 'octocat' } : null } });
    if (pathname === '/api/markdown') return route.fulfill({ json: { html: '<p>Preview</p>' } });
    return route.fulfill({ status: 404, json: { error: { reason: 'invalid-request' } } });
  });
}

export const widgetUrl = (options: { theme?: string; lang?: string } = {}) =>
  `/widget?${new URLSearchParams({ repo: 'o/r', term: 'en-US/computing', origin: 'https://ipl.example/en-US/computing/', categoryId: 'DIC_1', category: 'Comments', theme: options.theme ?? 'ipl-light', lang: options.lang ?? 'en' })}`;
