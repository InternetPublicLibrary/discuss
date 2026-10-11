import { cloneElement, type ComponentChildren, createContext, type VNode } from 'preact';
import { useContext, useMemo } from 'preact/hooks';

/**
 * Translations without next-translate (spec 001). Locale files keep giscus's format: plain strings, or plural
 * objects keyed by "0" / Intl plural categories, with {{variables}} and <tag>…</tag> placeholders for components.
 */
type Entry = string | Record<string, string>;
export type Messages = Record<string, Entry>;

const loaders = import.meta.glob<Messages>('../../../locales/*/common.json', { import: 'default' });
export const AVAILABLE_LOCALES = Object.keys(loaders).map((path) => path.split('/').at(-2) ?? '').filter(Boolean);

/**
 * `pt-BR`, `pt-br` and `pt_BR` → `pt-BR`, then `pt`, then `en`; unknown codes fall back to `en` (#14).
 */
export function resolveLocale(requested: string | null | undefined, available: readonly string[] = AVAILABLE_LOCALES): string {
  const wanted = (requested ?? '').trim().replace(/_/g, '-');
  if (!wanted) return 'en';
  const byLower = new Map(available.map((locale) => [locale.toLowerCase(), locale]));
  const exact = byLower.get(wanted.toLowerCase());
  if (exact) return exact;
  const base = byLower.get(wanted.split('-')[0]?.toLowerCase() ?? '');
  if (base) return base;
  console.warn(`[discuss] Unsupported language "${requested}", using English.`);
  return 'en';
}

export async function loadMessages(locale: string): Promise<Messages> {
  const load = loaders[`../../../locales/${locale}/common.json`] ?? loaders['../../../locales/en/common.json'];
  return load ? load() : {};
}

export type Query = Record<string, string | number>;

export function translate(messages: Messages, fallback: Messages, locale: string, key: string, query: Query = {}): string {
  const entry = messages[key] ?? fallback[key] ?? key;
  let text: string;
  if (typeof entry === 'string') text = entry;
  else {
    const count = Number(query.count ?? 0);
    const category = new Intl.PluralRules(locale).select(count);
    text = (count === 0 ? entry['0'] : undefined) ?? entry[category] ?? entry.other ?? key;
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => String(query[name] ?? ''));
}

interface I18nValue {
  locale: string;
  dir: 'ltr' | 'rtl';
  t: (key: string, query?: Query) => string;
}

const RTL = new Set(['ar', 'fa', 'he']);
const I18nContext = createContext<I18nValue>({ locale: 'en', dir: 'ltr', t: (key) => key });

export function I18nProvider({ locale, messages, fallback, children }: { locale: string; messages: Messages; fallback: Messages; children: ComponentChildren }) {
  const value = useMemo<I18nValue>(
    () => ({ locale, dir: RTL.has(locale.split('-')[0] ?? '') ? 'rtl' : 'ltr', t: (key, query) => translate(messages, fallback, locale, key, query) }),
    [locale, messages, fallback],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Render a message whose `<name>…</name>` parts become the given elements (only known names; text is never HTML). */
export function Trans({ i18nKey, query, components }: { i18nKey: string; query?: Query; components: Record<string, VNode> }) {
  const { t } = useI18n();
  const text = t(i18nKey, query);
  const parts: (string | VNode)[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    parts.push(text.slice(last, match.index));
    const element = components[match[1] ?? ''];
    parts.push(element ? cloneElement(element, {}, match[2]) : (match[2] ?? ''));
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function useDateFormatters() {
  const { locale } = useI18n();
  return useMemo(() => {
    const absolute = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60], ['second', 1],
    ];
    return {
      formatDate: (iso: string) => absolute.format(new Date(iso)),
      formatDistance: (iso: string, now = Date.now()) => {
        const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
        const [unit, size] = units.find(([, length]) => Math.abs(seconds) >= length) ?? ['second', 1];
        return relative.format(Math.round(seconds / size), unit);
      },
    };
  }, [locale]);
}
