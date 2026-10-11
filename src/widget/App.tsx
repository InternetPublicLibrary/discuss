import { useEffect, useState } from 'preact/hooks';
import { Discussion } from './components/Discussion';
import { AuthProvider } from './lib/auth';
import type { WidgetConfig } from './lib/config';
import { I18nProvider, loadMessages, type Messages, resolveLocale } from './lib/i18n';
import { postToParent } from './lib/messages';
import { sendQuote } from './lib/quote';
import { applyTheme } from './lib/theme';

/** The widget: loads translations and the theme, then the discussion; tells the IPL page it is ready and its height. */
/** Wait (up to 10 s, while comments load) for the linked comment, highlight it and report its offset. */
function revealComment(id: string, parentOrigin: string): void {
  const found = () => {
    const element = document.getElementById(id);
    if (!element) return false;
    element.classList.add('discuss-linked');
    postToParent({ type: 'discuss:scroll', top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - 8) }, parentOrigin);
    return true;
  };
  if (found()) return;
  const observer = new MutationObserver(() => found() && observer.disconnect());
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10_000);
}

export function App({ config }: { config: WidgetConfig }) {
  const locale = resolveLocale(config.lang);
  const [messages, setMessages] = useState<{ current: Messages; fallback: Messages } | null>(null);

  const [theme, setTheme] = useState(config.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Settings from the IPL page (client.js), accepted only from the embedding page itself (#12).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!config.parentOrigin || event.origin !== config.parentOrigin || event.source !== window.parent) return;
      const message = (event.data as { discuss?: { setConfig?: { theme?: unknown }; quote?: unknown; scrollTo?: unknown } } | null)?.discuss;
      if (typeof message?.setConfig?.theme === 'string') setTheme(message.setConfig.theme);
      // A passage quoted from the IPL page (plain text only, capped) prefills the comment box (#19).
      if (typeof message?.quote === 'string') sendQuote(message.quote.slice(0, 4000));
      // A "copy link" URL (#discuss-comment-<id>) opened on the IPL page: tell it where that comment is (#19).
      if (typeof message?.scrollTo === 'string' && /^discuss-comment-[A-Za-z0-9_=-]{1,100}$/.test(message.scrollTo)) revealComment(message.scrollTo, config.parentOrigin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [config.parentOrigin]);

  useEffect(() => {
    Promise.all([loadMessages(locale), loadMessages('en')]).then(([current, fallback]) => setMessages({ current, fallback }));
  }, [locale]);

  useEffect(() => {
    if (!messages) return;
    postToParent({ type: 'discuss:ready' }, config.parentOrigin);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => postToParent({ type: 'discuss:resize', height: Math.ceil(document.body.scrollHeight) }, config.parentOrigin));
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [messages, config.parentOrigin]);

  if (!messages) return null;
  return (
    <I18nProvider locale={locale} messages={messages.current} fallback={messages.fallback}>
      {config.repo && (config.term || config.number) ? (
        <AuthProvider>
          <Discussion config={config} />
        </AuthProvider>
      ) : (
        <p role="alert">{messages.current['reason.empty-term'] as string}</p>
      )}
    </I18nProvider>
  );
}
