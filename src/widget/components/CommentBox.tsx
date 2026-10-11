import { useEffect, useRef, useState } from 'preact/hooks';
import type { Comment, Reply } from '../../shared/types';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { processCommentBody } from '../lib/body';
import { pageFields, type WidgetConfig } from '../lib/config';
import { loadDraft, saveDraft } from '../lib/draft';
import { useI18n } from '../lib/i18n';
import { SignIn } from './SignIn';

export type Posted = { discussionId: string; comment?: Comment; reply?: Reply };

interface Props {
  config: WidgetConfig;
  discussionId: string | null;
  replyToId?: string;
  onPosted: (posted: Posted) => void;
}

export function CommentBox({ config, discussionId, replyToId, onPosted }: Props) {
  const { t } = useI18n();
  const { identity, post, signOut } = useAuth();
  const draftKey = `discuss-draft:${config.repo}:${config.term || config.number}:${replyToId ?? 'main'}`;
  const [text, setText] = useState(() => loadDraft(draftKey));
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveDraft(draftKey, text), [draftKey, text]);

  if (!identity) {
    return (
      <div className="gsc-comment-box">
        <p className="color-text-secondary text-sm mb-2">{t('signInToComment')}</p>
        <SignIn />
      </div>
    );
  }

  const signedIn = (
    <p className="color-text-secondary text-xs flex items-center gap-2">
      {identity.avatarUrl ? <img src={identity.avatarUrl} width={20} height={20} alt="" className="rounded-full" /> : null}
      <span>{t('signedInAs', { name: identity.name })}</span>
      <button type="button" className="link-secondary underline" onClick={() => void signOut()}>{t('signOut')}</button>
    </p>
  );

  if (identity.provider !== 'github') {
    return (
      <div className="gsc-comment-box">
        {signedIn}
        <p className="color-text-secondary text-sm mt-2">{t('orcidCommentingSoon')}</p>
      </div>
    );
  }

  const showPreview = async () => {
    setTab('preview');
    setPreview('');
    const { html } = await post<{ html: string }>('/api/markdown', { repo: config.repo, text }).catch(() => ({ html: '' }));
    setPreview(html);
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const posted = await post<Posted>('/api/comments', { ...pageFields(config), ...(discussionId ? { discussionId } : {}), ...(replyToId ? { replyToId } : {}), body: text });
      setText('');
      setTab('write');
      onPosted(posted);
    } catch (caught) {
      setError(caught instanceof ApiError ? t(`reason.${caught.reason}`) : t('postingFailed'));
    } finally {
      setBusy(false);
    }
  };

  const label = replyToId ? t('writeAReply') : t('writeAComment');
  return (
    <form className="gsc-comment-box" onSubmit={submit}>
      <div className="gsc-comment-box-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'write'} className="gsc-comment-box-tab" onClick={() => setTab('write')}>{t('write')}</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className="gsc-comment-box-tab" onClick={() => void showPreview()} disabled={!text.trim()}>{t('preview')}</button>
      </div>
      {tab === 'write' ? (
        <textarea
          ref={textarea}
          className="form-control input-contrast gsc-comment-box-textarea"
          aria-label={label}
          placeholder={label}
          value={text}
          onInput={(event) => setText((event.target as HTMLTextAreaElement).value)}
          disabled={busy}
        />
      ) : (
        <div className="markdown gsc-comment-box-preview" dangerouslySetInnerHTML={{ __html: preview ? processCommentBody(preview) : t('loadingPreview') }} />
      )}
      <div className="gsc-comment-box-bottom flex items-center justify-between gap-2">
        {signedIn}
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          {busy ? t('posting') : replyToId ? t('postReply') : t('postComment')}
        </button>
      </div>
      <p className="color-text-danger text-sm" role="alert">{error}</p>
    </form>
  );
}
