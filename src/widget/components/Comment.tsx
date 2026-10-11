import { useState } from 'preact/hooks';
import type { Comment as CommentData } from '../../shared/types';
import { processCommentBody } from '../lib/body';
import { useDateFormatters, useI18n } from '../lib/i18n';
import { ReactionSummary } from './Reactions';
import { Reply } from './Reply';

const SHOWN_REPLIES = 5;

export function Comment({ comment }: { comment: CommentData }) {
  const { t } = useI18n();
  const { formatDate, formatDistance } = useDateFormatters();
  const [showAll, setShowAll] = useState(false);
  const hidden = !!comment.deletedAt || comment.isMinimized;
  const replies = showAll ? comment.replies : comment.replies.slice(-SHOWN_REPLIES);
  const earlierLoaded = comment.replies.length - replies.length;

  return (
    <article className="gsc-comment" aria-label={`${comment.author.login}, ${formatDate(comment.createdAt)}`}>
      <div className={`color-bg-primary w-full min-w-0 rounded-md border ${comment.viewerDidAuthor ? 'color-box-border-info' : 'color-border-primary'}`}>
        {!comment.isMinimized ? (
          <div className="gsc-comment-header">
            <div className="gsc-comment-author">
              <a rel="nofollow noopener noreferrer" target="_blank" href={comment.author.url} className="gsc-comment-author-avatar">
                <img className="mr-2 rounded-full" src={comment.author.avatarUrl} width={30} height={30} alt="" loading="lazy" />
                <span className="link-primary overflow-hidden text-ellipsis font-semibold">{comment.author.login}</span>
              </a>
              <a rel="nofollow noopener noreferrer" target="_blank" href={comment.url} className="link-secondary overflow-hidden text-ellipsis">
                <time className="whitespace-nowrap" title={formatDate(comment.createdAt)} dateTime={comment.createdAt}>
                  {formatDistance(comment.createdAt)}
                </time>
              </a>
              {comment.authorAssociation !== 'NONE' ? (
                <span className="hidden text-xs leading-[18px] sm:inline-flex">
                  <span className="color-box-border-info font-medium capitalize ml-1 rounded-xl border px-[7px]">{t(comment.authorAssociation)}</span>
                </span>
              ) : null}
            </div>
            {comment.lastEditedAt ? <span className="color-text-secondary gsc-comment-edited" title={t('lastEditedAt', { date: formatDate(comment.lastEditedAt) })}>{t('edited')}</span> : null}
          </div>
        ) : null}
        {hidden ? (
          <div className="markdown gsc-comment-content minimized color-bg-tertiary border-color-primary">
            <em className="color-text-secondary">{comment.deletedAt ? t('thisCommentWasDeleted') : t('thisCommentWasMinimized')}</em>
          </div>
        ) : (
          <div dir="auto" className="markdown gsc-comment-content" dangerouslySetInnerHTML={{ __html: processCommentBody(comment.bodyHTML) }} />
        )}
        {!comment.isMinimized ? (
          <div className="gsc-comment-footer">
            <div className="gsc-comment-reactions">
              {/* Upvotes cannot be toggled with app-issued tokens (#20): a count, not a control. */}
              {comment.upvoteCount > 0 ? <span className="gsc-social-reaction-summary-item color-text-secondary">▲ {t('upvotes', { count: comment.upvoteCount })}</span> : null}
              {!hidden ? <ReactionSummary reactions={comment.reactions} /> : null}
            </div>
            <div className="gsc-comment-replies-count">
              <span className="color-text-tertiary text-xs">{t('replies', { count: comment.replyCount, plus: '' })}</span>
            </div>
          </div>
        ) : null}
        {replies.length > 0 ? (
          <div className="color-bg-inset color-border-primary gsc-replies rounded-b-md">
            {earlierLoaded > 0 ? (
              <div className="flex h-8 items-center mb-2 pl-4">
                <button type="button" className="color-text-link underline" onClick={() => setShowAll(true)}>
                  {t('showPreviousReplies', { count: earlierLoaded })}
                </button>
              </div>
            ) : null}
            <ol className="list-none">
              {replies.map((reply) => <Reply key={reply.id} reply={reply} />)}
            </ol>
          </div>
        ) : null}
      </div>
    </article>
  );
}
