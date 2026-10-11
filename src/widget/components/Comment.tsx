import { useState } from 'preact/hooks';
import type { Comment as CommentData, Reply as ReplyData } from '../../shared/types';
import { associationKey } from '../lib/association';
import { useAuth } from '../lib/auth';
import type { WidgetConfig } from '../lib/config';
import { getJson } from '../lib/api';
import { processCommentBody } from '../lib/body';
import { useDateFormatters, useI18n } from '../lib/i18n';
import { Author } from './Author';
import { EditBox } from './EditBox';
import { CommentBox } from './CommentBox';
import { CommentMenu } from './CommentMenu';
import { Hidden } from './Hidden';
import { ReactionButtons } from './ReactionButtons';
import { Reply } from './Reply';

const SHOWN_REPLIES = 5;

export function Comment({ comment: initial, config, discussionId, locked }: { comment: CommentData; config: WidgetConfig; discussionId: string | null; locked: boolean }) {
  const [comment, setComment] = useState(initial);
  const [editing, setEditing] = useState(false);
  const repo = config.repo;
  const { identity } = useAuth();
  const [posted, setPosted] = useState<ReplyData[]>([]);
  const { t } = useI18n();
  const { formatDate, formatDistance } = useDateFormatters();
  const [showAll, setShowAll] = useState(false);
  const [older, setOlder] = useState<{ replies: ReplyData[]; cursor: string | null }>({ replies: [], cursor: comment.repliesStartCursor });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hidden = !!comment.deletedAt || comment.isMinimized;
  const allLoaded = [...older.replies, ...comment.replies, ...posted];
  const replies = showAll ? allLoaded : allLoaded.slice(-SHOWN_REPLIES);
  const earlierLoaded = allLoaded.length - replies.length;
  // Replies posted here are not in replyCount, so they must not hide the older ones still on GitHub.
  const unfetched = Math.max(0, comment.replyCount - older.replies.length - comment.replies.length);

  // More than 100 replies: older pages come from the API with GitHub's cursor (#22).
  const loadOlder = () => {
    if (!older.cursor || loadingOlder) return;
    setLoadingOlder(true);
    const params = new URLSearchParams({ repo, comment: comment.id, before: older.cursor });
    getJson<{ replies: ReplyData[]; startCursor: string | null }>(`/api/comments/replies?${params}`)
      .then((page) => {
        setOlder((current) => ({ replies: [...page.replies, ...current.replies], cursor: page.startCursor }));
        setShowAll(true);
      })
      .finally(() => setLoadingOlder(false));
  };

  return (
    <article id={`discuss-comment-${comment.id}`} className="gsc-comment" aria-label={`${comment.orcidAuthor?.name ?? comment.author.login}, ${formatDate(comment.createdAt)}`}>
      <div className={`color-bg-primary w-full min-w-0 rounded-md border ${comment.viewerDidAuthor ? 'color-box-border-info' : 'color-border-primary'}`}>
        {!comment.isMinimized ? (
          <div className="gsc-comment-header">
            <div className="gsc-comment-author">
              <Author item={comment} avatarClass="mr-2 rounded-full" />
              <a rel="nofollow noopener noreferrer" target="_blank" href={comment.url} className="link-secondary overflow-hidden text-ellipsis">
                <time className="whitespace-nowrap" title={formatDate(comment.createdAt)} dateTime={comment.createdAt}>
                  {formatDistance(comment.createdAt)}
                </time>
              </a>
              {associationKey(comment.authorAssociation) && !comment.orcidAuthor ? (
                <span className="hidden text-xs leading-[18px] sm:inline-flex">
                  <span className="color-box-border-info font-medium ml-1 rounded-xl border px-[7px]">{t(associationKey(comment.authorAssociation) ?? '')}</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {comment.lastEditedAt ? <span className="color-text-secondary gsc-comment-edited" title={t('lastEditedAt', { date: formatDate(comment.lastEditedAt) })}>{t('edited')}</span> : null}
              {!comment.deletedAt ? <CommentMenu item={comment} config={config} onEdit={() => setEditing(true)} onDeleted={() => setComment({ ...comment, deletedAt: new Date().toISOString() })} /> : null}
            </div>
          </div>
        ) : null}
        {comment.isMinimized && !comment.deletedAt ? (
          <Hidden reason={comment.minimizedReason}>
            {() => (
              <>
                {comment.orcidAuthor ? <p className="color-text-secondary text-xs">{comment.orcidAuthor.name} · ORCID {comment.orcidAuthor.id}</p> : null}
                <div dir="auto" dangerouslySetInnerHTML={{ __html: processCommentBody(comment.bodyHTML) }} />
              </>
            )}
          </Hidden>
        ) : hidden ? (
          <div className="markdown gsc-comment-content minimized color-bg-tertiary border-color-primary">
            <em className="color-text-secondary">{t('thisCommentWasDeleted')}</em>
          </div>
        ) : editing ? (
          <EditBox item={comment} config={config} onDone={(updated) => { if (updated) setComment({ ...comment, ...updated }); setEditing(false); }} />
        ) : (
          <div dir="auto" className="markdown gsc-comment-content" dangerouslySetInnerHTML={{ __html: processCommentBody(comment.bodyHTML) }} />
        )}
        {!comment.isMinimized ? (
          <div className="gsc-comment-footer">
            <div className="gsc-comment-reactions">
              {/* Upvotes cannot be toggled with app-issued tokens (#20): a count, not a control. */}
              {comment.upvoteCount > 0 ? <span className="gsc-social-reaction-summary-item color-text-secondary">▲ {t('upvotes', { count: comment.upvoteCount })}</span> : null}
              {!hidden ? <ReactionButtons config={config} reactions={comment.reactions} subjectId={comment.id} /> : null}
            </div>
            <div className="gsc-comment-replies-count">
              <span className="color-text-tertiary text-xs">{t('replies', { count: comment.replyCount, plus: '' })}</span>
            </div>
          </div>
        ) : null}
        {replies.length > 0 ? (
          <div className="color-bg-inset color-border-primary gsc-replies rounded-b-md">
            {unfetched > 0 && older.cursor && (showAll || earlierLoaded === 0) ? (
              <div className="flex h-8 items-center mb-2 pl-4">
                <button type="button" className="color-text-link underline" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? t('loading') : t('loadEarlierReplies', { count: unfetched })}
                </button>
              </div>
            ) : null}
            {earlierLoaded > 0 ? (
              <div className="flex h-8 items-center mb-2 pl-4">
                <button type="button" className="color-text-link underline" onClick={() => setShowAll(true)}>
                  {t('showPreviousReplies', { count: earlierLoaded })}
                </button>
              </div>
            ) : null}
            <ol className="list-none">
              {replies.map((reply) => <Reply key={reply.id} reply={reply} config={config} />)}
            </ol>
          </div>
        ) : null}
        {identity && !locked && !hidden && config.input === 'widget' ? (
          <div className="gsc-reply-box">
            <CommentBox config={config} discussionId={discussionId} replyToId={comment.id} onPosted={({ reply }) => reply && setPosted((items) => [...items, reply])} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
