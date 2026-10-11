import { useState } from 'preact/hooks';
import { getJson } from '../lib/api';
import { pageFields, type WidgetConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';

/** data-input="github" (#16): comment on github.com instead of authorising the app; the discussion is created first. */
export function GitHubLink({ config, url }: { config: WidgetConfig; url: string | null }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (url) {
    return <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">{t('commentOnGitHub')}</a>;
  }
  const open = async () => {
    setBusy(true);
    // Open the window synchronously (popup rules), then point it at the discussion once it exists.
    const target = window.open('about:blank', '_blank');
    try {
      const created = await getJson<{ url: string }>('/api/discussions/ensure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pageFields(config)) });
      if (target) {
        target.opener = null;
        target.location.href = created.url;
      } else window.open(created.url, '_blank', 'noopener');
    } catch {
      target?.close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-primary" onClick={() => void open()} disabled={busy}>
      {busy ? t('openingGitHub') : t('commentOnGitHub')}
    </button>
  );
}
