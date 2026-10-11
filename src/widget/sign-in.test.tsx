import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { readConfig } from './lib/config';

const GITHUB = { identity: { provider: 'github', id: '1', login: 'octocat', name: 'The Octocat', profileUrl: 'https://github.com/octocat' }, csrfToken: 'csrf-123' };
const ORCID = { identity: { provider: 'orcid', id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'x' }, csrfToken: 'csrf-9' };
const config = () => readConfig('?repo=o/r&term=pt-BR/x&categoryId=DIC_1&category=Comments&title=Página&origin=https://ipl.example/pt-BR/x/');
const notFound = () => Response.json({ error: { reason: 'discussion-not-found' } }, { status: 404 });

type Handler = (url: string, init?: RequestInit) => Response | undefined;
function api(handler: Handler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(String(input), init) ?? notFound());
}
const bodyOf = (spy: ReturnType<typeof api>, path: string) => JSON.parse(String(spy.mock.calls.find(([url]) => String(url) === path)?.[1]?.body ?? '{}'));
const button = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);

beforeEach(() => {
  window.sessionStorage.clear();
  document.body.replaceChildren();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('popup sign-in (#17)', () => {
  it('signs in with the ticket from its own popup and the nonce it generated', async () => {
    const popup = { closed: false } as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    const spy = api((url) => (url === '/api/session' ? Response.json({ error: { reason: 'signed-out' } }, { status: 401 }) : url === '/api/session/exchange' ? Response.json(GITHUB) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    await vi.waitFor(() => expect(button(root, 'Sign in with GitHub')).toBeDefined());

    button(root, 'Sign in with GitHub')?.click();
    const nonce = new URL(String(open.mock.calls[0]?.[0]), 'https://discuss.example').searchParams.get('nonce');
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: popup, data: { discuss: { signIn: { ticket: 'evil' } } } }));
    window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup, data: { discuss: { signIn: { ticket: 'T'.repeat(43) } } } }));

    await vi.waitFor(() => expect(root.textContent).toContain('Signed in as The Octocat'));
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bodyOf(spy, '/api/session/exchange')).toEqual({ ticket: 'T'.repeat(43), nonce });
    expect(spy.mock.calls.filter(([url]) => String(url) === '/api/session/exchange')).toHaveLength(1);
  });

  it('says when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    api((url) => (url === '/api/session' ? Response.json({}, { status: 401 }) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    await vi.waitFor(() => expect(button(root, 'Sign in with ORCID')).toBeDefined());
    button(root, 'Sign in with ORCID')?.click();

    await vi.waitFor(() => expect(root.querySelector('[role="status"]')?.textContent).toContain('blocked the sign-in window'));
  });

  it('keeps the draft in the widget storage (survives a reload during sign-in)', async () => {
    api((url) => (url === '/api/session' ? Response.json(GITHUB) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    const area = await vi.waitFor(() => {
      const found = root.querySelector('textarea');
      expect(found).not.toBeNull();
      return found as HTMLTextAreaElement;
    });
    area.value = 'Rascunho importante';
    area.dispatchEvent(new Event('input', { bubbles: true }));

    const again = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, again);
    await vi.waitFor(() => expect(again.querySelector('textarea')?.value).toBe('Rascunho importante'));
  });
});

describe('writing as a GitHub reader', () => {
  it('posts a comment with the page fields and shows it at once', async () => {
    const posted = { id: 'DC_9', author: { avatarUrl: 'a', login: 'octocat', url: 'u' }, viewerDidAuthor: true, createdAt: '2026-10-11T00:00:00Z', url: 'u', authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>Primeiro!</p>', reactions: {}, upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: true, replyCount: 0, replies: [], repliesStartCursor: null };
    const spy = api((url) => (url === '/api/session' ? Response.json(GITHUB) : url === '/api/comments' ? Response.json({ discussionId: 'D_new', comment: posted }, { status: 201 }) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    const area = await vi.waitFor(() => {
      const found = root.querySelector('textarea');
      expect(found).not.toBeNull();
      return found as HTMLTextAreaElement;
    });
    area.value = 'Primeiro!';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(button(root, 'Comment')?.disabled).toBe(false));
    button(root, 'Comment')?.click();

    await vi.waitFor(() => expect(root.textContent).toContain('Primeiro!'));
    expect(bodyOf(spy, '/api/comments')).toMatchObject({ repo: 'o/r', categoryId: 'DIC_1', term: 'pt-BR/x', title: 'Página', body: 'Primeiro!' });
    const headers = spy.mock.calls.find(([url]) => String(url) === '/api/comments')?.[1]?.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('csrf-123');
    expect(root.textContent).toContain('1 comment');
  });

  it('shows the first reaction on a page without a discussion immediately, and keeps it (#20)', async () => {
    let resolve: (value: Response) => void = () => undefined;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/session') return Response.json(GITHUB);
      if (url === '/api/reactions') return new Promise<Response>((done) => { resolve = done; });
      return notFound();
    });
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    const heart = await vi.waitFor(() => {
      const found = root.querySelector<HTMLButtonElement>('button[aria-label="Add Love reaction"]');
      expect(found).not.toBeNull();
      return found as HTMLButtonElement;
    });
    heart.click();

    await vi.waitFor(() => expect(heart.getAttribute('aria-pressed')).toBe('true'));
    expect(heart.textContent).toContain('1');
    resolve(Response.json({ subjectId: 'D_new', reactions: { HEART: { count: 1, viewerHasReacted: true } } }));
    await vi.waitFor(() => expect(spy.mock.calls.some(([url]) => String(url) === '/api/reactions')).toBe(true));
    expect(bodyOf(spy, '/api/reactions')).toMatchObject({ term: 'pt-BR/x', categoryId: 'DIC_1', content: 'HEART', remove: false });
    await vi.waitFor(() => expect(heart.getAttribute('aria-pressed')).toBe('true'));
  });

  it('shows no focusable upvote control (#20)', async () => {
    api((url) => (url === '/api/session' ? Response.json(GITHUB) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    await vi.waitFor(() => expect(root.querySelector('textarea')).not.toBeNull());

    expect(root.querySelector('.gsc-upvote-button')).toBeNull();
  });
});

describe('ORCID readers', () => {
  it('see reactions read-only with an explanation and no comment box yet', async () => {
    api((url) => (url === '/api/session' ? Response.json(ORCID) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);

    await vi.waitFor(() => expect(root.textContent).toContain('Signed in as Josiah Carberry'));
    expect(root.textContent).toContain('Reactions are available to GitHub accounts only.');
    expect(root.querySelector('button[aria-label^="Add"]')).toBeNull();
    expect(root.querySelector('textarea')).toBeNull();
  });
});

describe('input modes and permissions (#16)', () => {
  it('explains GitHub permissions next to the sign-in buttons, linked to the privacy policy', async () => {
    api((url) => (url === '/api/session' ? Response.json({}, { status: 401 }) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={config()} />, root);
    await vi.waitFor(() => expect(button(root, 'Sign in with GitHub')).toBeDefined());

    expect(root.textContent).toContain('It cannot see your e-mail or private repositories.');
    expect(button(root, 'Sign in with GitHub')?.getAttribute('aria-describedby')).toBe('discuss-sign-in-explainer');
    expect(root.querySelector('a[href$="PRIVACY-POLICY.md"]')).not.toBeNull();
  });

  it('data-input="none" shows comments read-only: no box, no sign-in, no reaction buttons', async () => {
    api((url) => (url === '/api/session' ? Response.json(GITHUB) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={readConfig('?repo=o/r&term=pt-BR/x&categoryId=DIC_1&input=none')} />, root);
    await vi.waitFor(() => expect(root.textContent).toContain('0 comments'));

    expect(root.querySelector('textarea')).toBeNull();
    expect(button(root, 'Sign in with GitHub')).toBeUndefined();
    expect(root.querySelector('button[aria-label^="Add"]')).toBeNull();
  });

  it('data-input="github" creates the discussion when missing and opens it on github.com', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const spy = api((url) => (url === '/api/session' ? Response.json({}, { status: 401 }) : url === '/api/discussions/ensure' ? Response.json({ number: 4, url: 'https://github.com/o/r/discussions/4' }) : undefined));
    const root = document.body.appendChild(document.createElement('div'));
    render(<App config={readConfig('?repo=o/r&term=pt-BR/x&categoryId=DIC_1&input=github')} />, root);
    await vi.waitFor(() => expect(button(root, 'Comment on GitHub')).toBeDefined());
    button(root, 'Comment on GitHub')?.click();

    await vi.waitFor(() => expect(tab.location.href).toBe('https://github.com/o/r/discussions/4'));
    expect(tab.opener).toBeNull();
    expect(bodyOf(spy, '/api/discussions/ensure')).toMatchObject({ repo: 'o/r', term: 'pt-BR/x', categoryId: 'DIC_1' });
    expect(root.querySelector('textarea')).toBeNull();
  });
});
