import { useEffect, useState } from 'preact/hooks';
import type { CommentOrder, WidgetConfig } from '../lib/config';
import { useDiscussion } from '../lib/discussion';
import { useI18n } from '../lib/i18n';
import { postToParent } from '../lib/messages';
import { Comment } from './Comment';
import { REACTIONS, type Comment as CommentData, type ReactionGroups } from '../../shared/types';
import { CommentBox, type Posted } from './CommentBox';
import { GitHubLink } from './GitHubLink';
import { ReactionButtons } from './ReactionButtons';

const NO_REACTIONS = Object.fromEntries(Object.keys(REACTIONS).map((key) => [key, { count: 0, viewerHasReacted: false }])) as ReactionGroups;

export function Discussion({ config }: { config: WidgetConfig }) {
  const { t } = useI18n();
  const [order, setOrder] = useState<CommentOrder>(config.defaultCommentOrder);
  const data = useDiscussion(config, order);
  const notFound = data.error?.reason === 'discussion-not-found';
  const error = notFound ? null : data.error;
  // Writes add to what was loaded; the first write on a page without a discussion learns its id (#20).
  const [added, setAdded] = useState<CommentData[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const discussionId = data.page?.discussion.id ?? createdId;
  const onPosted = (posted: Posted) => {
    setCreatedId((id) => id ?? posted.discussionId);
    if (posted.comment) setAdded((items) => [...items, posted.comment as CommentData]);
  };

  useEffect(() => {
    if (error) postToParent({ type: 'discuss:error', reason: error.reason }, config.parentOrigin);
  }, [error, config.parentOrigin]);

  useEffect(() => {
    if (config.emitMetadata && data.page) postToParent({ type: 'discuss:metadata', discussion: { id: data.page.discussion.id, url: data.page.discussion.url } }, config.parentOrigin);
  }, [data.page, config.emitMetadata, config.parentOrigin]);

  if (data.isLoading) {
    return (
      <div className="gsc-loading" role="status" aria-live="polite">
        <div className="gsc-loading-image" />
        <span className="gsc-loading-text color-fg-muted">{t('loadingComments')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="color-text-secondary gsc-error" role="alert">
        {t(`reason.${error.reason}`)}
      </p>
    );
  }

  // data-hidden-comments="omit": minimised comments are left out entirely (#18).
  const visible = (comments: CommentData[]) => (config.hiddenComments === 'omit' ? comments.filter((comment) => !comment.isMinimized) : comments);
  const discussion = data.page?.discussion;
  const total = (discussion?.totalCommentCount ?? 0) + added.length;
  const locked = discussion?.locked ?? false;
  const box = locked || config.input === 'none'
    ? null
    : config.input === 'github'
      ? <div className="gsc-comment-box"><GitHubLink config={config} url={discussion?.url ?? null} /></div>
      : <CommentBox config={config} discussionId={discussionId} onPosted={onPosted} />;

  return (
    <div className="color-text-primary gsc-main">
      {config.reactionsEnabled ? (
        <section className="gsc-reactions" aria-label={t('reactions', { count: discussion?.reactionCount ?? 0 })}>
          <h2 className="gsc-reactions-count">
            {discussion ? (
              <a href={discussion.url} target="_blank" rel="noreferrer noopener nofollow" className="color-text-primary">
                {t('reactions', { count: discussion.reactionCount })}
              </a>
            ) : (
              t('reactions', { count: 0 })
            )}
          </h2>
          <div className="flex flex-auto items-center justify-center gap-2 text-sm mt-2">
            <ReactionButtons config={config} reactions={discussion?.reactions ?? NO_REACTIONS} subjectId={discussionId} onSubject={setCreatedId} />
          </div>
        </section>
      ) : null}

      <section className="gsc-comments" aria-label={t('comments', { count: total })}>
        <div className="gsc-header">
          <div className="gsc-left-header">
            <h2 className="gsc-comments-count">
              {discussion ? (
                <a href={discussion.url} target="_blank" rel="noreferrer noopener nofollow" className="color-text-primary underline">
                  {t('comments', { count: total })}
                </a>
              ) : (
                t('comments', { count: total })
              )}
            </h2>
            {discussion && discussion.totalReplyCount > 0 ? (
              <>
                <span className="gsc-comments-count-separator" aria-hidden="true">·</span>
                <span className="gsc-replies-count">{t('replies', { count: discussion.totalReplyCount, plus: data.numHidden > 0 ? '+' : '' })}</span>
              </>
            ) : null}
          </div>
          {total > 0 ? (
            <div className="gsc-right-header BtnGroup" role="group">
              {(['oldest', 'newest'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`btn BtnGroup-item ${order === value ? 'BtnGroup-item--selected' : ''}`}
                  aria-pressed={order === value}
                  onClick={() => setOrder(value)}
                >
                  {t(value)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {config.inputPosition === 'top' ? box : null}
        {total === 0 ? <p className="color-text-secondary">{t('noCommentsYet')}</p> : null}

        <div className={`gsc-timeline ${total ? '' : 'hidden'}`}>
          {visible(data.frontComments).map((comment) => <Comment key={comment.id} comment={comment} config={config} discussionId={discussionId} locked={locked} />)}
          {data.numHidden > 0 ? (
            <div className="pagination-loader-container gsc-pagination">
              <button type="button" className="gsc-pagination-button color-border-primary" onClick={data.loadMore} disabled={data.isLoadingMore}>
                <span className="color-text-secondary">{t('hiddenItems', { count: data.numHidden })}</span>
                <span className="color-text-link font-semibold">{data.isLoadingMore ? t('loading') : t('loadMore')}…</span>
              </button>
            </div>
          ) : null}
          {visible([...data.backComments, ...added]).map((comment) => <Comment key={comment.id} comment={comment} config={config} discussionId={discussionId} locked={locked} />)}
        </div>

        {config.inputPosition !== 'top' ? box : null}
      </section>
    </div>
  );
}
