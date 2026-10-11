import { useState } from 'preact/hooks';
import { REACTIONS, type Reaction, type ReactionGroups } from '../../shared/types';
import { useAuth } from '../lib/auth';
import { pageFields, type WidgetConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';
import { ReactionSummary } from './Reactions';

interface Props {
  config: WidgetConfig;
  reactions: ReactionGroups;
  /** Null for a page without a discussion yet: the first reaction creates it (#20). */
  subjectId: string | null;
  onSubject?: (id: string) => void;
}

/**
 * Reactions. GitHub readers toggle them: the count changes at once and is reconciled with GitHub's answer (#20);
 * signed-out and ORCID readers see the counts and why they cannot react.
 */
export function ReactionButtons({ config, reactions, subjectId, onSubject }: Props) {
  const { t } = useI18n();
  const { identity, post } = useAuth();
  const [groups, setGroups] = useState(reactions);
  const [subject, setSubject] = useState(subjectId);
  const [pending, setPending] = useState(false);
  // Follow new data from the parent only when it actually changes (an effect on mount would undo a quick first click).
  const [seen, setSeen] = useState({ reactions, subjectId });
  if (seen.reactions !== reactions || seen.subjectId !== subjectId) {
    setSeen({ reactions, subjectId });
    if (seen.reactions !== reactions) setGroups(reactions);
    if (seen.subjectId !== subjectId && subjectId) setSubject(subjectId);
  }

  if (identity?.provider !== 'github') {
    const hint = identity ? t('orcidCannotReact') : t('signInToReact');
    return (
      <div className="flex flex-wrap items-center gap-2">
        <ReactionSummary reactions={groups} />
        <span className="sr-only">{hint}</span>
      </div>
    );
  }

  const toggle = async (key: Reaction) => {
    if (pending) return;
    const before = groups;
    const current = groups[key] ?? { count: 0, viewerHasReacted: false };
    const remove = current.viewerHasReacted;
    setGroups({ ...groups, [key]: { count: Math.max(0, current.count + (remove ? -1 : 1)), viewerHasReacted: !remove } });
    setPending(true);
    try {
      const result = await post<{ subjectId: string; reactions: ReactionGroups }>('/api/reactions', {
        ...(subject ? { repo: config.repo, subjectId: subject } : pageFields(config)),
        content: key,
        remove,
      });
      setGroups(result.reactions);
      if (!subject) {
        setSubject(result.subjectId);
        onSubject?.(result.subjectId);
      }
    } catch {
      setGroups(before);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="gsc-direct-reaction-buttons flex flex-wrap gap-1" role="group" aria-label={t('addReactions')}>
      {(Object.keys(REACTIONS) as Reaction[]).map((key) => {
        const group = groups[key] ?? { count: 0, viewerHasReacted: false };
        return (
          <button
            key={key}
            type="button"
            className={`gsc-direct-reaction-button gsc-social-reaction-summary-item ${group.viewerHasReacted ? 'has-reacted' : ''}`}
            aria-pressed={group.viewerHasReacted}
            aria-label={t(group.viewerHasReacted ? 'removeTheReaction' : 'addTheReaction', { reaction: t(key) })}
            onClick={() => void toggle(key)}
            disabled={pending}
          >
            <span className="gsc-direct-reaction-button-emoji" aria-hidden="true">{REACTIONS[key]}</span>
            {group.count ? <span className="gsc-social-reaction-summary-item-count" aria-hidden="true">{group.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
