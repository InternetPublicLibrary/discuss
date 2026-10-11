import { REACTIONS, type Reaction, type ReactionGroups } from '../../shared/types';
import { useI18n } from '../lib/i18n';

/** Reaction counts. Read-only until signed-in reactions arrive (spec 002). */
export function ReactionSummary({ reactions }: { reactions: Partial<ReactionGroups> }) {
  const { t } = useI18n();
  const groups = (Object.entries(reactions) as [Reaction, ReactionGroups[Reaction]][]).filter(([key, group]) => key in REACTIONS && group.count > 0);
  if (!groups.length) return null;
  return (
    <ul className="gsc-direct-reaction-buttons" aria-label={t('addReactions')}>
      {groups.map(([key, group]) => (
        <li key={key} className="gsc-direct-reaction-button gsc-social-reaction-summary-item" title={t('peopleReactedWith', { count: group.count, reaction: t(key), emoji: t('emoji') })}>
          <span className="gsc-direct-reaction-button-emoji" aria-hidden="true">{REACTIONS[key]}</span>
          <span className="gsc-social-reaction-summary-item-count" aria-hidden="true">{group.count}</span>
          <span className="sr-only">{t('peopleReactedWith', { count: group.count, reaction: t(key), emoji: t('emoji') })}</span>
        </li>
      ))}
    </ul>
  );
}
