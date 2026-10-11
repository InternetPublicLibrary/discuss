import DOMPurify from 'dompurify';

/**
 * Comment HTML comes from GitHub's Markdown renderer (bodyHTML). It is sanitised again here as defence in depth —
 * ORCID comments are posted by our App (spec 003) — then links open in a new tab (never replacing the IPL page) without referrer or SEO weight. In-page anchors
 * (heading links, footnotes) would point at the bare widget, so they lose their href and keep their text.
 */
export function processCommentBody(bodyHTML: string): string {
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(bodyHTML, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  });
  for (const anchor of template.content.querySelectorAll('a')) {
    if ((anchor.getAttribute('href') ?? '').startsWith('#')) {
      anchor.removeAttribute('href');
      continue;
    }
    anchor.rel = 'noopener noreferrer nofollow ugc';
    anchor.target = '_blank';
  }
  return template.innerHTML;
}
