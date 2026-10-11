import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment as CommentData } from '../../shared/types';
import { App } from '../App';
import { readConfig } from '../lib/config';

const ME = { identity: { provider: 'orcid', id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'x' }, csrfToken: 'c' };
const comment = (overrides: Partial<CommentData>): CommentData => ({
  id: 'C1', author: { avatarUrl: 'a', login: 'ipl-discuss[bot]', url: 'u' }, viewerDidAuthor: false, createdAt: '2026-10-01T00:00:00Z', url: 'https://github.com/o/r/discussions/1#discussioncomment-1', authorAssociation: 'NONE',
  lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>Primeira linha\nSegunda</p>', reactions: {} as CommentData['reactions'],
  upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null, ...overrides,
});
const page = (comments: CommentData[]) => ({ viewer: null, discussion: { id: 'D', number: 1, url: 'u', locked: false, totalCommentCount: comments.length, totalReplyCount: 0, pageInfo: { startCursor: null, hasNextPage: false, hasPreviousPage: false, endCursor: null }, repository: { nameWithOwner: 'o/r' }, reactionCount: 0, reactions: {}, comments } });

async function show(comments: CommentData[], query = '?repo=o/r&term=x&origin=https://ipl.example/pt-BR/x/', waitForArticle = true) {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => (String(input) === '/api/session' ? Response.json(ME) : String(input).startsWith('/api/orcid/comments/') ? new Response(null, { status: 204 }) : Response.json(page(comments))));
  const root = document.body.appendChild(document.createElement('div'));
  render(<App config={readConfig(query)} />, root);
  if (waitForArticle) await vi.waitFor(() => expect(root.querySelector('article')).not.toBeNull());
  await vi.waitFor(() => expect(root.textContent).toContain('Signed in as'));
  return { root, spy };
}
const menuItems = (article: Element) => [...article.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);

afterEach(() => {
  // Unmount so a previous test's comment box no longer listens for quotes.
  for (const root of document.body.children) render(null, root);
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('comment menu (#19)', () => {
  it('offers edit and delete only on the reader’s own ORCID comments', async () => {
    const mine = comment({ id: 'C_mine', orcidAuthor: { id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'x' } });
    const theirs = comment({ id: 'C_theirs', orcidAuthor: { id: '0000-0001-1111-1111', name: 'Other', profileUrl: 'x' } });
    const { root } = await show([mine, theirs]);
    const [first, second] = [...root.querySelectorAll('article')];

    expect(menuItems(first as Element)).toEqual(expect.arrayContaining(['Copy link', 'Copy GitHub link', 'Quote reply', 'Edit', 'Delete', 'Report']));
    expect(menuItems(second as Element)).not.toContain('Edit');
    expect(menuItems(second as Element)).not.toContain('Delete');
  });

  it('copies a link to the comment on the IPL page', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const { root } = await show([comment({})]);
    ([...root.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Copy link') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('https://ipl.example/pt-BR/x/#discuss-comment-C1'));
    expect(root.querySelector('#discuss-comment-C1')).not.toBeNull();
  });

  it('quote reply puts the text into the comment box with "> " prefixes', async () => {
    const { root } = await show([comment({})]);
    ([...root.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Quote reply') as HTMLButtonElement).click();

    await vi.waitFor(() => expect((root.querySelector('textarea[aria-label="Write a comment"]') as HTMLTextAreaElement).value).toBe('> Primeira linha\n> Segunda\n\n'));
  });

  it('deletes after a confirmation step, without browser dialogs', async () => {
    const { root, spy } = await show([comment({ orcidAuthor: { id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'x' } })]);
    const item = (label: string) => [...root.querySelectorAll('[role="menuitem"]')].find((element) => element.textContent === label) as HTMLButtonElement;
    item('Delete').click();
    await vi.waitFor(() => expect(item('Delete this comment?')).toBeDefined());
    item('Delete this comment?').click();

    await vi.waitFor(() => expect(root.textContent).toContain('This comment was deleted.'));
    expect(spy.mock.calls.some(([url, init]) => String(url) === '/api/orcid/comments/C1?repo=o%2Fr' && init?.method === 'DELETE')).toBe(true);
  });

  it('accepts a quote from the IPL page only', async () => {
    const { root } = await show([], '?repo=o/r&term=x&origin=https://ipl.example/pt-BR/x/', false);
    const area = () => root.querySelector('textarea[aria-label="Write a comment"]') as HTMLTextAreaElement;
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: window.parent, data: { discuss: { quote: 'evil' } } }));
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://ipl.example', source: window.parent, data: { discuss: { quote: 'Trecho do recurso' } } }));

    await vi.waitFor(() => expect(area().value).toBe('> Trecho do recurso\n\n'));
  });
});
