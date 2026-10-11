import { useState } from 'preact/hooks';
import type { Comment, Reply } from '../../shared/types';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { WidgetConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';

/** Inline editor for the reader's own comment; GitHub's rendered HTML comes back from the API (#19). */
export function EditBox({ item, config, onDone }: { item: Comment | Reply; config: WidgetConfig; onDone: (updated: { bodyHTML: string; lastEditedAt: string | null } | null) => void }) {
  const { t } = useI18n();
  const { send } = useAuth();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const save = async (event: Event) => {
    event.preventDefault();
    const base = item.orcidAuthor ? '/api/orcid/comments' : '/api/comments';
    try {
      onDone(await send<{ bodyHTML: string; lastEditedAt: string | null }>('PATCH', `${base}/${encodeURIComponent(item.id)}`, { repo: config.repo, body: text }));
    } catch (caught) {
      setError(caught instanceof ApiError ? t(`reason.${caught.reason}`) : t('postingFailed'));
    }
  };
  return (
    <form className="gsc-comment-box p-2" onSubmit={save}>
      <textarea className="form-control input-contrast gsc-comment-box-textarea" aria-label={t('edit')} value={text} onInput={(event) => setText((event.target as HTMLTextAreaElement).value)} />
      <div className="flex gap-2 justify-end mt-2">
        <button type="button" className="btn" onClick={() => onDone(null)}>{t('cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>{t('save')}</button>
      </div>
      <p className="color-text-danger text-sm" role="alert">{error}</p>
    </form>
  );
}
