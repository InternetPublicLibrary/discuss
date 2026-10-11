import type { Reply as ReplyData } from '../../shared/types';
import type { WidgetConfig } from '../lib/config';
import { processCommentBody } from '../lib/body';
import { useDateFormatters, useI18n } from '../lib/i18n';
import { associationKey } from '../lib/association';
import { useState } from 'preact/hooks';
import { Author } from './Author';
import { CommentMenu } from './CommentMenu';
import { EditBox } from './EditBox';
import { Hidden } from './Hidden';
import { ReactionButtons } from './ReactionButtons';

export function Reply({ reply: initial, config }: { reply: ReplyData; config: WidgetConfig }) {
  const [reply, setReply] = useState(initial);
  const [editing, setEditing] = useState(false);
  const { t } = useI18n();
  const { formatDate, formatDistance } = useDateFormatters();
  const hidden = !!reply.deletedAt || reply.isMinimized;
  return (
    <li id={`discuss-comment-${reply.id}`} className="gsc-reply">
      <div className="gsc-tl-line" />
      <div className={`flex ${hidden ? 'items-center' : ''}`}>
        <div className="gsc-reply-author-avatar">
          {reply.orcidAuthor ? (
            <span className="rounded-full discuss-orcid-avatar" aria-hidden="true">iD</span>
          ) : (
            // The author name next to it is the accessible link; the avatar repeats it for pointer users only.
            <a rel="nofollow noopener noreferrer" target="_blank" href={reply.author.url} className="flex items-center" aria-hidden="true" tabIndex={-1}>
              <img className="rounded-full" src={reply.author.avatarUrl} width={30} height={30} alt="" loading="lazy" />
            </a>
          )}
        </div>
        <div className="w-full min-w-0 ml-2">
          {!hidden ? (
            <div className="gsc-reply-header">
              <div className="gsc-reply-author">
                <Author item={reply} avatarClass="hidden" />
                {associationKey(reply.authorAssociation) && !reply.orcidAuthor ? (
                  <span className="hidden text-xs leading-[18px] sm:inline-flex">
                    <span className="color-box-border-info font-medium ml-1 rounded-xl border px-[7px]">{t(associationKey(reply.authorAssociation) ?? '')}</span>
                  </span>
                ) : null}
                <a rel="nofollow noopener noreferrer" target="_blank" href={reply.url} className="link-secondary overflow-hidden text-ellipsis">
                  <time className="whitespace-nowrap" title={formatDate(reply.createdAt)} dateTime={reply.createdAt}>
                    {formatDistance(reply.createdAt)}
                  </time>
                </a>
              </div>
              <div className="flex items-center gap-1">
                {reply.lastEditedAt ? <span className="color-text-secondary gsc-reply-edited" title={t('lastEditedAt', { date: formatDate(reply.lastEditedAt) })}>{t('edited')}</span> : null}
                <CommentMenu item={reply} config={config} onEdit={() => setEditing(true)} onDeleted={() => setReply({ ...reply, deletedAt: new Date().toISOString() })} />
              </div>
            </div>
          ) : null}
          {reply.isMinimized && !reply.deletedAt ? (
            <Hidden reason={reply.minimizedReason}>{() => <div dir="auto" dangerouslySetInnerHTML={{ __html: processCommentBody(reply.bodyHTML) }} />}</Hidden>
          ) : hidden ? (
            <div className="markdown gsc-reply-content not-shown">
              <em className="color-text-secondary">{t('thisCommentWasDeleted')}</em>
            </div>
          ) : editing ? (
            <EditBox item={reply} config={config} onDone={(updated) => { if (updated) setReply({ ...reply, ...updated }); setEditing(false); }} />
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
