import { useEffect, useRef, useState } from 'preact/hooks';
import type { Comment, Reply } from '../../shared/types';
import { ApiError, getJson } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { WidgetConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';

/** Inline editor for the reader's own comment, prefilled with its Markdown; GitHub's rendered HTML comes back (#19). */
export function EditBox({ item, config, onDone }: { item: Comment | Reply; config: WidgetConfig; onDone: (updated: { bodyHTML: string; lastEditedAt: string | null } | null) => void }) {
  const { t } = useI18n();
  const { send } = useAuth();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);

  useEffect(() => {
    let current = true;
    getJson<{ body: string }>(`/api/comments/${encodeURIComponent(item.id)}/source?repo=${encodeURIComponent(config.repo)}`)
      .then(({ body }) => current && (setText(body), setLoaded(true)))
      .catch((caught: unknown) => current && setError(caught instanceof ApiError ? t(`reason.${caught.reason}`) : t('postingFailed')));
    return () => {
      current = false;
    };
  }, [item.id, config.repo, t]);

  const save = async (event: Event) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    const base = item.orcidAuthor ? '/api/orcid/comments' : '/api/comments';
    try {
      onDone(await send<{ bodyHTML: string; lastEditedAt: string | null }>('PATCH', `${base}/${encodeURIComponent(item.id)}`, { repo: config.repo, body: text }));
    } catch (caught) {
      setError(caught instanceof ApiError ? t(`reason.${caught.reason}`) : t('postingFailed'));
    } finally {
      saving.current = false;
    }
  };
  return (
    <form className="gsc-comment-box p-2" onSubmit={save}>
      <textarea className="form-control input-contrast gsc-comment-box-textarea" aria-label={t('edit')} value={text} disabled={!loaded} onInput={(event) => setText((event.target as HTMLTextAreaElement).value)} />
      <div className="flex gap-2 justify-end mt-2">
        <button type="button" className="btn" onClick={() => onDone(null)}>{t('cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={!loaded || !text.trim()}>{t('save')}</button>
      </div>
      <p className="color-text-danger text-sm" role="alert">{error}</p>
    </form>
  );
}
