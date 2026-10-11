import DOMPurify from 'dompurify';

/**
 * Comment HTML comes from GitHub's Markdown renderer (bodyHTML). It is sanitised again here as defence in depth —
 * ORCID comments are posted by our App (spec 003) — then links open outside the iframe without referrer or SEO weight.
 */
export function processCommentBody(bodyHTML: string): string {
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(bodyHTML, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'input', 'button'] });
  for (const anchor of template.content.querySelectorAll('a')) {
    anchor.rel = 'noopener noreferrer nofollow ugc';
    anchor.target = '_top';
  }
  return template.innerHTML;
}
