import { useEffect, useState } from 'preact/hooks';
import { Discussion } from './components/Discussion';
import type { WidgetConfig } from './lib/config';
import { I18nProvider, loadMessages, type Messages, resolveLocale } from './lib/i18n';
import { postToParent } from './lib/messages';
import { applyTheme } from './lib/theme';

/** The widget: loads translations and the theme, then the discussion; tells the IPL page it is ready and its height. */
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
      const setConfig = (event.data as { discuss?: { setConfig?: { theme?: unknown } } } | null)?.discuss?.setConfig;
      if (typeof setConfig?.theme === 'string') setTheme(setConfig.theme);
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
      {config.repo && (config.term || config.number) ? <Discussion config={config} /> : <p role="alert">{messages.current['reason.empty-term'] as string}</p>}
    </I18nProvider>
  );
}
