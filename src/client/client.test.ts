import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, metaContent, termFor, widgetParams } from './client';

const ORIGIN = 'https://discuss.example';

function setup(data: Record<string, string> = {}, path = '/pt-BR/ciencia/?token=secret#comments') {
  window.history.replaceState(null, '', path);
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  const script = document.createElement('script');
  script.src = `${ORIGIN}/client.js`;
  Object.assign(script.dataset, { repo: 'InternetPublicLibrary/pt-BR', categoryId: 'DIC_1', strict: '1', theme: 'light', lang: 'pt-BR', ...data });
  document.body.appendChild(script);
  return script;
}

let intersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
beforeEach(() => {
  intersect = null;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      intersect = callback;
    }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(window, 'fetch').mockImplementation(async () => Response.json({ service: 'discuss' }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const frame = () => document.querySelector<HTMLIFrameElement>('iframe.discuss-frame');
const widgetMessage = (message: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, source: frame()?.contentWindow ?? null, data: { discuss: message } }));

describe('terms and parameters', () => {
  it('reads og:title before <meta name="title"> (#10)', () => {
    document.head.innerHTML = '<meta name="title" content="Plain"><meta property="og:title" content="From OG">';

    expect(metaContent(document, 'title', true)).toBe('From OG');
  });

  it('uses the canonical pathname term with the base path removed (#11)', () => {
    setup({}, '/base/pt-BR/ci%C3%AAncia/index.html');

    expect(termFor(document, window.location, { basePath: '/base' })).toBe('pt-BR/ciência');
  });

  it('never sends the query, fragment or any session to the widget (#6)', () => {
    setup();
    const params = widgetParams(document, window.location, { repo: 'o/r' });

    expect(params.get('origin')).toBe('http://localhost:3000/pt-BR/ciencia/');
    expect(params.toString()).not.toMatch(/secret|session|token/);
  });
});

describe('boot', () => {
  it('refuses a page without a term: no request, one warning (#23)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const script = setup({ mapping: 'specific', term: '' });

    expect(boot(script)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(window.fetch).not.toHaveBeenCalled();
    expect(frame()).toBeNull();
  });

  it('creates the iframe only when the container comes into view (#24)', async () => {
    boot(setup());
    expect(frame()).toBeNull();

    intersect?.([{ isIntersecting: true }]);
    await vi.waitFor(() => expect(frame()).not.toBeNull());
    expect(frame()?.src).toMatch(/^https:\/\/discuss\.example\/widget\?/);
    expect(new URL(frame()?.src ?? '').searchParams.get('term')).toBe('pt-BR/ciencia');
  });

  it('loads eagerly where IntersectionObserver is missing', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    Reflect.deleteProperty(window, 'IntersectionObserver');
    boot(setup());

    await vi.waitFor(() => expect(frame()).not.toBeNull());
  });

  it('runs again after client-side navigation without stacking iframes (#24)', async () => {
    const script = setup({ loading: 'eager' });
    boot(script);
    await vi.waitFor(() => expect(frame()).not.toBeNull());
    boot(script);
    await vi.waitFor(() => expect(document.querySelectorAll('iframe')).toHaveLength(1));
  });

  it('says clearly when the site is not allowed (#8)', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async () => Response.json({ error: { reason: 'origin-not-allowed' } }, { status: 403 }));
    const events: unknown[] = [];
    document.addEventListener('discuss:error', (event) => events.push((event as CustomEvent).detail));
    boot(setup({ loading: 'eager' }));

    await vi.waitFor(() => expect(document.querySelector('.discuss-unavailable')?.textContent).toBe('Comments are not available on this site.'));
    expect(frame()).toBeNull();
    expect(events).toContainEqual({ reason: 'origin-not-allowed' });
  });

  it('queues the theme until the widget is ready, then delivers it once (#12)', async () => {
    const api = boot(setup({ loading: 'eager' }));
    await vi.waitFor(() => expect(frame()).not.toBeNull());
    const posted: unknown[] = [];
    vi.spyOn(frame()?.contentWindow as Window, 'postMessage').mockImplementation((message: unknown) => posted.push(message));

    for (let index = 0; index < 10; index += 1) api?.setTheme(index % 2 ? 'dark' : 'light');
    expect(posted).toEqual([]);
    widgetMessage({ type: 'discuss:ready' });

    expect(posted.at(-1)).toEqual({ discuss: { setConfig: { theme: 'dark' } } });
    api?.setTheme('light');
    expect(posted.at(-1)).toEqual({ discuss: { setConfig: { theme: 'light' } } });
  });

  it('re-dispatches widget errors and resizes the frame, ignoring other origins', async () => {
    boot(setup({ loading: 'eager' }));
    await vi.waitFor(() => expect(frame()).not.toBeNull());
    const events: unknown[] = [];
    document.addEventListener('discuss:error', (event) => events.push((event as CustomEvent).detail));

    widgetMessage({ type: 'discuss:resize', height: 321.4 });
    widgetMessage({ type: 'discuss:error', reason: 'rate-limited' });
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { discuss: { type: 'discuss:resize', height: 1 } } }));

    expect(frame()?.style.height).toBe('322px');
    expect(events).toContainEqual({ reason: 'rate-limited' });
  });

  it('a re-run for another page stops the previous one, so no stale iframe appears later (review)', async () => {
    const script = setup({}, '/pt-BR/a/');
    boot(script);
    const first = intersect;
    window.history.replaceState(null, '', '/pt-BR/b/');
    boot(script);

    first?.([{ isIntersecting: true }]);
    intersect?.([{ isIntersecting: true }]);

    await vi.waitFor(() => expect(document.querySelectorAll('iframe.discuss-frame')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.querySelectorAll('iframe.discuss-frame')).toHaveLength(1);
    expect(frame()?.src).toContain(encodeURIComponent('/pt-BR/b/'));
  });

  it('asks the widget to reveal a linked comment and scrolls to it (#19)', async () => {
    const script = setup({ loading: 'eager' }, '/pt-BR/a/#discuss-comment-C1');
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    boot(script);
    await vi.waitFor(() => expect(frame()).not.toBeNull());
    const posted = vi.spyOn(frame()?.contentWindow as Window, 'postMessage');

    widgetMessage({ type: 'discuss:ready' });
    widgetMessage({ type: 'discuss:scroll', top: 120 });

    expect(posted).toHaveBeenCalledWith({ discuss: { scrollTo: 'discuss-comment-C1' } }, ORIGIN);
    expect(scroll).toHaveBeenCalledWith({ top: expect.any(Number) });
  });
});

