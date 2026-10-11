import type { Comment, Reply } from '../../shared/types';
import { useI18n } from '../lib/i18n';

/** The comment's author: the ORCID reader (name + iD badge) for App-posted ORCID comments, never the bot (#15, #21). */
export function Author({ item, avatarClass }: { item: Comment | Reply; avatarClass: string }) {
  const { t } = useI18n();
  if (item.orcidAuthor) {
    const { id, name, profileUrl } = item.orcidAuthor;
    return (
      <a rel="nofollow noopener noreferrer" target="_blank" href={profileUrl} className="gsc-comment-author-avatar flex items-center gap-1">
        <span className={`${avatarClass} discuss-orcid-avatar`} aria-hidden="true">iD</span>
        <span className="link-primary overflow-hidden text-ellipsis font-semibold">{name}</span>
        <span className="discuss-orcid-badge text-xs" aria-label={t('orcidBadge', { id })} title={t('orcidBadge', { id })}>ORCID</span>
      </a>
    );
  }
  const name = item.author.name?.trim();
  return (
    <a rel="nofollow noopener noreferrer" target="_blank" href={item.author.url} className="gsc-comment-author-avatar flex items-center">
      <img className={avatarClass} src={item.author.avatarUrl} width={30} height={30} alt="" loading="lazy" />
      <span className="link-primary overflow-hidden text-ellipsis font-semibold">{name || item.author.login}</span>
      {name ? <span className="color-text-secondary ml-1 overflow-hidden text-ellipsis">(@{item.author.login})</span> : null}
    </a>
  );
}
