import { useState } from 'preact/hooks';
import type { Comment, Reply } from '../../shared/types';
import { useAuth } from '../lib/auth';
import type { WidgetConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';
import { sendQuote } from '../lib/quote';

interface Props {
  item: Comment | Reply;
  config: WidgetConfig;
  onEdit: () => void;
  onDeleted: () => void;
}

/** The text of a rendered comment, for quoting. */
const plainText = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.textContent ?? '';
};

export const isOwn = (item: Comment | Reply, identity: ReturnType<typeof useAuth>['identity']) =>
  !!identity && (item.orcidAuthor ? identity.provider === 'orcid' && item.orcidAuthor.id === identity.id : identity.provider === 'github' && item.author.login === identity.login);

/** Copy link, quote reply, report — and edit/delete on the reader's own comments (#19). */
export function CommentMenu({ item, config, onEdit, onDeleted }: Props) {
  const { t } = useI18n();
  const { identity, send } = useAuth();
  const [status, setStatus] = useState('');
  const [confirming, setConfirming] = useState(false);
  const own = isOwn(item, identity);
  const pageLink = `${config.backLink.split('#')[0]}#discuss-comment-${item.id}`;
  const report = `https://github.com/${config.repo}/issues/new?${new URLSearchParams({ title: 'Report a comment', body: `Comment: ${item.url}\n\nWhy it should be reviewed:` })}`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t('linkCopied'));
    } catch {
      setStatus(text);
    }
  };

  const remove = async () => {
    const base = item.orcidAuthor ? '/api/orcid/comments' : '/api/comments';
    await send('DELETE', `${base}/${encodeURIComponent(item.id)}?repo=${encodeURIComponent(config.repo)}`);
    onDeleted();
  };

  return (
    <details className="gsc-comment-menu relative">
      <summary className="link-secondary px-1" aria-label={t('commentMenu')}>⋯</summary>
      <div className="color-bg-overlay color-border-primary border rounded-md p-1 text-sm absolute right-0 z-10 flex flex-col items-start" role="menu">
        <button type="button" role="menuitem" onClick={() => void copy(pageLink)}>{t('copyLink')}</button>
        <button type="button" role="menuitem" onClick={() => void copy(item.url)}>{t('copyGitHubLink')}</button>
        {identity && config.input === 'widget' ? <button type="button" role="menuitem" onClick={() => sendQuote(plainText(item.bodyHTML))}>{t('quoteReply')}</button> : null}
        {own ? <button type="button" role="menuitem" onClick={onEdit}>{t('edit')}</button> : null}
        {own && !confirming ? <button type="button" role="menuitem" onClick={() => setConfirming(true)}>{t('delete')}</button> : null}
        {own && confirming ? <button type="button" role="menuitem" className="color-text-danger" onClick={() => void remove()}>{t('confirmDelete')}</button> : null}
        <a role="menuitem" href={report} target="_blank" rel="noopener noreferrer">{t('report')}</a>
        <span className="color-text-secondary text-xs" role="status" aria-live="polite">{status}</span>
      </div>
    </details>
  );
}
