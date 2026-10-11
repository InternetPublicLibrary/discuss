import { canonicalPathTerm } from '../shared/terms';
import type { Reason } from '../shared/reasons';

/**
 * client.js — the script IPL pages embed (spec 004 contract). It never touches sessions or tokens (#6): sign-in
 * happens inside the widget iframe. Events from the widget are re-dispatched on the container as DOM events
 * (`discuss:ready`, `discuss:error`, `discuss:metadata`) and the page can call `window.discuss.setTheme(name)`.
 */
export interface DiscussApi {
  setTheme(theme: string): void;
  setConfig(config: Record<string, unknown>): void;
}

type WidgetMessage =
  | { type: 'discuss:ready' }
  | { type: 'discuss:resize'; height: number }
  | { type: 'discuss:error'; reason: Reason }
  | { type: 'discuss:metadata'; discussion: unknown };

const NOT_ALLOWED_TEXT = 'Comments are not available on this site.';

/** `og:title` first, then `<meta name="title">`, never the other way round (#10). */
export function metaContent(doc: Document, name: string, og = false): string {
  const read = (selector: string) => doc.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? '';
  return (og ? read(`meta[property="og:${name}"]`) : '') || read(`meta[name="${name}"]`);
}

export function termFor(doc: Document, location: Location, data: DOMStringMap): string {
  switch (data.mapping) {
    case 'url':
      return `${location.origin}${location.pathname}`;
    case 'title':
      return doc.title.trim();
    case 'og:title':
      return metaContent(doc, 'title', true);
    case 'specific':
      return (data.term ?? '').trim();
    case 'number':
      return '';
    default:
      return canonicalPathTerm(location.pathname, data.basePath ?? '');
  }
}

export function widgetParams(doc: Document, location: Location, data: DOMStringMap): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined) => {
    if (value) params.set(key, value);
  };
  // The page link without query or fragment: nothing secret travels to the widget (#6).
  const page = `${location.origin}${location.pathname}`;
  set('origin', page);
  set('backLink', page);
  set('repo', data.repo);
  set('repoId', data.repoId);
  set('category', data.category);
  set('categoryId', data.categoryId);
  set('strict', data.strict);
  set('theme', data.theme);
  set('lang', data.lang);
  set('reactionsEnabled', data.reactionsEnabled);
  set('emitMetadata', data.emitMetadata);
  set('inputPosition', data.inputPosition);
  set('input', data.input);
  set('defaultCommentOrder', data.defaultCommentOrder);
  set('description', metaContent(doc, 'discuss:description') || metaContent(doc, 'description', true));
  set('title', metaContent(doc, 'discuss:title') || metaContent(doc, 'title', true) || doc.title.trim());
  if (data.mapping === 'number') set('number', data.term);
  else set('term', termFor(doc, location, data));
  return params;
}

export function boot(script: HTMLScriptElement, win: Window & typeof globalThis = window): DiscussApi | null {
  const doc = win.document;
  const data = script.dataset;
  const discussOrigin = new URL(script.src).origin;
  const params = widgetParams(doc, win.location, data);

  if (!params.get('term') && !params.get('number')) {
    win.console.warn('[discuss] This page has no discussion term; the comment box was not loaded.');
    return null;
  }

  // One container per page: reuse it on re-runs (client-side navigation), never stack iframes (#24).
  const existing = doc.querySelector<HTMLElement>('.discuss');
  const container = existing ?? doc.createElement('div');
  if (!existing) {
    container.className = 'discuss';
    script.insertAdjacentElement('afterend', container);
  }
  const src = `${discussOrigin}/widget?${params}`;
  if ([...container.querySelectorAll('iframe')].some((frame) => frame.src === src)) return (win as unknown as { discuss: DiscussApi }).discuss;
  container.replaceChildren();

  let iframe: HTMLIFrameElement | null = null;
  let ready = false;
  const queue: Record<string, unknown>[] = [];
  let theme = data.theme ?? '';

  const emit = (type: string, detail: unknown) => container.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  const send = (config: Record<string, unknown>) => {
    if (!iframe?.contentWindow || !ready) {
      queue.push(config);
      return;
    }
    iframe.contentWindow.postMessage({ discuss: { setConfig: config } }, discussOrigin);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== discussOrigin || !iframe || event.source !== iframe.contentWindow) return;
    const message = (event.data as { discuss?: WidgetMessage } | null)?.discuss;
    if (!message) return;
    if (message.type === 'discuss:resize') iframe.style.height = `${Math.max(0, Math.ceil(message.height))}px`;
    else if (message.type === 'discuss:ready') {
      ready = true;
      // Settings sent before the widget was ready, and the current theme, are delivered now (#12).
      const pending = queue.splice(0);
      if (theme) pending.push({ theme });
      for (const config of pending) iframe.contentWindow?.postMessage({ discuss: { setConfig: config } }, discussOrigin);
      emit('discuss:ready', {});
    } else if (message.type === 'discuss:error') emit('discuss:error', { reason: message.reason });
    else if (message.type === 'discuss:metadata') emit('discuss:metadata', { discussion: message.discussion });
  };
  win.addEventListener('message', onMessage);

  const notAllowed = () => {
    const note = doc.createElement('p');
    note.className = 'discuss-unavailable';
    note.textContent = NOT_ALLOWED_TEXT;
    container.replaceChildren(note);
    emit('discuss:error', { reason: 'origin-not-allowed' });
  };

  const load = async () => {
    // A page the service does not allow would get a blank frame (frame-ancestors); say so clearly instead (#8).
    try {
      const response = await win.fetch(`${discussOrigin}/api/health`, { credentials: 'omit' });
      if (response.status === 403) return notAllowed();
    } catch {
      // Network trouble: let the iframe try and report its own error.
    }
    iframe = doc.createElement('iframe');
    iframe.className = 'discuss-frame';
    iframe.title = data.lang?.toLowerCase().startsWith('pt') ? 'Comentários' : 'Comments';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.colorScheme = 'normal';
    iframe.src = src;
    container.appendChild(iframe);
  };

  // Lazy loading that works on every browser: IntersectionObserver one viewport ahead, eager without it (#24).
  if (data.loading !== 'eager' && 'IntersectionObserver' in win) {
    const observer = new win.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void load();
      }
    }, { rootMargin: '100% 0px' });
    observer.observe(container);
  } else void load();

  const api: DiscussApi = {
    setTheme(name: string) {
      theme = name;
      send({ theme: name });
    },
    setConfig(config: Record<string, unknown>) {
      if (typeof config.theme === 'string') theme = config.theme;
      send(config);
    },
  };
  (win as unknown as { discuss: DiscussApi }).discuss = api;
  return api;
}

if (typeof document !== 'undefined' && document.currentScript instanceof HTMLScriptElement) boot(document.currentScript);
