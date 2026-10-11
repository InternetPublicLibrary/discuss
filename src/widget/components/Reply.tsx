import type { Reply as ReplyData } from '../../shared/types';
import { processCommentBody } from '../lib/body';
import { useDateFormatters, useI18n } from '../lib/i18n';
import { ReactionSummary } from './Reactions';

export function Reply({ reply }: { reply: ReplyData }) {
  const { t } = useI18n();
  const { formatDate, formatDistance } = useDateFormatters();
  const hidden = !!reply.deletedAt || reply.isMinimized;
  return (
    <li className="gsc-reply">
      <div className="gsc-tl-line" />
      <div className={`flex ${hidden ? 'items-center' : ''}`}>
        <div className="gsc-reply-author-avatar">
          <a rel="nofollow noopener noreferrer" target="_blank" href={reply.author.url} className="flex items-center">
            <img className="rounded-full" src={reply.author.avatarUrl} width={30} height={30} alt="" loading="lazy" />
          </a>
        </div>
        <div className="w-full min-w-0 ml-2">
          {!hidden ? (
            <div className="gsc-reply-header">
              <div className="gsc-reply-author">
                <a rel="nofollow noopener noreferrer" target="_blank" href={reply.author.url} className="flex min-w-0 items-center">
                  <span className="link-primary overflow-hidden text-ellipsis font-semibold">{reply.author.login}</span>
                </a>
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
                <ReactionSummary reactions={reply.reactions} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
