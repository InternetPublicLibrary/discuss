import { useEffect, useRef, useState } from 'preact/hooks';
import type { Comment, Reply } from '../../shared/types';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { processCommentBody } from '../lib/body';
import { pageFields, type WidgetConfig } from '../lib/config';
import { loadDraft, saveDraft } from '../lib/draft';
import { subscribeQuotes } from '../lib/quote';
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
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // State updates are async: a ref stops a double click from posting twice.
  const posting = useRef(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveDraft(draftKey, text), [draftKey, text]);

  // Quotes from "Quote reply" or the IPL page go into the main box only.
  useEffect(() => {
    if (replyToId) return;
    return subscribeQuotes((markdown) => {
      setText((current) => `${current}${current && !current.endsWith('\n\n') ? '\n\n' : ''}${markdown}`);
      setTab('write');
    });
  }, [replyToId]);

  if (!identity) {
    return (
      <div className="gsc-comment-box">
        <p className="color-text-secondary text-sm mb-2">{t('signInToComment')}</p>
        <SignIn />
        {config.guidelinesUrl ? (
          <p className="text-xs mt-1">
            <a href={config.guidelinesUrl} target="_blank" rel="noopener noreferrer" className="link-secondary underline">{t('communityGuidelines')}</a>
          </p>
        ) : null}
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

  const showPreview = async () => {
    setTab('preview');
    setPreview('');
    setPreviewFailed(false);
    const { html } = await post<{ html: string }>('/api/markdown', { repo: config.repo, text }).catch(() => ({ html: '' }));
    setPreview(html);
    setPreviewFailed(!html);
  };

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!text.trim() || posting.current) return;
    posting.current = true;
    setBusy(true);
    setError('');
    try {
      // ORCID readers post through the IPL App with attribution (spec 003); GitHub readers as themselves.
      const posted = await post<Posted>(identity.provider === 'orcid' ? '/api/orcid/comments' : '/api/comments', { ...pageFields(config), ...(discussionId ? { discussionId } : {}), ...(replyToId ? { replyToId } : {}), body: text });
      setText('');
      setTab('write');
      onPosted(posted);
    } catch (caught) {
      setError(caught instanceof ApiError ? t(`reason.${caught.reason}`) : t('postingFailed'));
    } finally {
      posting.current = false;
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
        <div className="markdown gsc-comment-box-preview" dangerouslySetInnerHTML={{ __html: preview ? processCommentBody(preview) : t(previewFailed ? 'previewFailed' : 'loadingPreview') }} />
      )}
      <div className="gsc-comment-box-bottom flex items-center justify-between gap-2">
        {signedIn}
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          {busy ? t('posting') : replyToId ? t('postReply') : t('postComment')}
        </button>
      </div>
      {identity.provider === 'orcid' ? <p className="color-text-secondary text-xs mt-1">{t('orcidPostingNote')}</p> : null}
      {config.guidelinesUrl ? (
        <p className="text-xs mt-1">
          <a href={config.guidelinesUrl} target="_blank" rel="noopener noreferrer" className="link-secondary underline">{t('communityGuidelines')}</a>
        </p>
      ) : null}
      <p className="color-text-danger text-sm" role="alert">{error}</p>
    </form>
  );
}
