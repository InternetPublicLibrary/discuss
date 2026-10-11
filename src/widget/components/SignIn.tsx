import { useAuth } from '../lib/auth';
import { Trans, useI18n } from '../lib/i18n';

/** Sign-in choices (GitHub or ORCID) and any sign-in problem, announced to screen readers. */
export function SignIn() {
  const { t } = useI18n();
  const { signIn, error } = useAuth();
  return (
    <div className="gsc-comment-box-buttons flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" aria-describedby="discuss-sign-in-explainer" onClick={() => signIn('github')}>{t('signInWithGitHub')}</button>
      <button type="button" className="btn" onClick={() => signIn('orcid')}>{t('signInWithOrcid')}</button>
      <p className="w-full color-text-secondary text-xs" id="discuss-sign-in-explainer">
        <Trans
          i18nKey="signInExplainer"
          components={{
            docs: <a href="https://docs.github.com/apps/using-github-apps/authorizing-github-apps" target="_blank" rel="noopener noreferrer" className="link-secondary underline" />,
            privacy: <a href="https://github.com/InternetPublicLibrary/discuss/blob/main/PRIVACY-POLICY.md" target="_blank" rel="noopener noreferrer" className="link-secondary underline" />,
          }}
        />{' '}
        {t('orcidExplainer')}
      </p>
      <p className="w-full color-text-secondary text-sm" role="status" aria-live="polite">{error ? t(error) : ''}</p>
    </div>
  );
}
