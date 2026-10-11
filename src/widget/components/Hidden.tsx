import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useI18n } from '../lib/i18n';

const REASONS = ['spam', 'abuse', 'off-topic', 'outdated', 'duplicate', 'resolved'];

/**
 * A comment a moderator minimised on GitHub (#18): collapsed with the translated reason; its body (and, for ORCID
 * comments, its attribution) is rendered only after the reader chooses to show it.
 */
export function Hidden({ reason, children }: { reason: string | null; children: () => ComponentChildren }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const key = (reason ?? '').toLowerCase().replace(/_/g, '-');
  const label = REASONS.includes(key) ? t('hiddenBecause', { reason: t(`minimized.${key}`) }) : t('hiddenNoReason');
  return (
    <div className="markdown gsc-comment-content minimized color-bg-tertiary border-color-primary">
      <p className="color-text-secondary">
        <em>{label}</em>{' '}
        <button type="button" className="link-secondary underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('hideHidden') : t('showHidden')}
        </button>
      </p>
      {open ? children() : null}
    </div>
  );
}
