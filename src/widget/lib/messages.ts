import type { Reason } from '../../shared/reasons';

/**
 * Messages to the embedding IPL page. Only ever posted to the page's own origin (never `*`).
 * Events: `discuss:ready`, `discuss:resize`, `discuss:error`, `discuss:metadata` (spec 004 contract).
 */
export type ParentMessage =
  | { type: 'discuss:ready' }
  | { type: 'discuss:resize'; height: number }
  | { type: 'discuss:error'; reason: Reason }
  | { type: 'discuss:metadata'; discussion: unknown };

export function postToParent(message: ParentMessage, parentOrigin: string): void {
  if (!parentOrigin || window.parent === window) return;
  window.parent.postMessage({ discuss: message }, parentOrigin);
}
