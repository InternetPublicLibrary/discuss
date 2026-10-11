/**
 * Reasons the API, the widget and client.js share (issue #23). The widget shows a translated message for each and
 * posts `discuss:error { reason }` to the IPL page. Stable contract: add, never rename.
 */
export const REASONS = [
  'empty-term',
  'repo-not-found',
  'repo-not-allowed',
  'category-mismatch',
  'origin-not-allowed',
  'rate-limited',
  'github-unavailable',
  'signed-out',
  'discussion-not-found',
  'invalid-request',
  'internal',
] as const;
export type Reason = (typeof REASONS)[number];
