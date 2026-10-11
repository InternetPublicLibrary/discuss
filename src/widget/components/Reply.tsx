import type { Reply as ReplyData } from '../../shared/types';
import type { WidgetConfig } from '../lib/config';
import { processCommentBody } from '../lib/body';
import { useDateFormatters, useI18n } from '../lib/i18n';
import { Author } from './Author';
import { ReactionButtons } from './ReactionButtons';

export function Reply({ reply, config }: { reply: ReplyData; config: WidgetConfig }) {
  const { t } = useI18n();
  const { formatDate, formatDistance } = useDateFormatters();
  const hidden = !!reply.deletedAt || reply.isMinimized;
  return (
    <li className="gsc-reply">
      <div className="gsc-tl-line" />
      <div className={`flex ${hidden ? 'items-center' : ''}`}>
        <div className="gsc-reply-author-avatar">
          {reply.orcidAuthor ? (
            <span className="rounded-full discuss-orcid-avatar" aria-hidden="true">iD</span>
          ) : (
            <a rel="nofollow noopener noreferrer" target="_blank" href={reply.author.url} className="flex items-center">
              <img className="rounded-full" src={reply.author.avatarUrl} width={30} height={30} alt="" loading="lazy" />
            </a>
          )}
        </div>
        <div className="w-full min-w-0 ml-2">
          {!hidden ? (
            <div className="gsc-reply-header">
              <div className="gsc-reply-author">
                <Author item={reply} avatarClass="hidden" />
                <a rel="nofollow noopener noreferrer" target="_blank" href={reply.url} className="link-secondary overflow-hidden text-ellipsis">
                  <time className="whitespace-nowrap" title={formatDate(reply.createdAt)} dateTime={reply.createdAt}>
                    {formatDistance(reply.createdAt)}
                  </time>
                </a>
              </div>
              {reply.lastEditedAt ? <span className="color-text-secondary gsc-reply-edited" title={t('lastEditedAt', { date: formatDate(reply.lastEditedAt) })}>{t('edited')}</span> : null}
            </div>
          ) : null}
          {hidden ? (
            <div className="markdown gsc-reply-content not-shown">
              <em className="color-text-secondary">{reply.deletedAt ? t('thisCommentWasDeleted') : t('thisCommentWasHidden')}</em>
            </div>
          ) : (
            <div dir="auto" className="markdown gsc-reply-content" dangerouslySetInnerHTML={{ __html: processCommentBody(reply.bodyHTML) }} />
          )}
          {!hidden ? (
            <div className="gsc-reply-footer">
              <div className="gsc-reply-reactions">
                <ReactionButtons config={config} reactions={reply.reactions} subjectId={reply.id} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
