/**
 * "Quote reply" and host-page quotes (#19) reach the main comment box. Quotes sent before the box has subscribed
 * (effects run after paint) are kept and delivered when it does, so a fast click is never lost.
 */
type Listener = (markdown: string) => void;
const listeners = new Set<Listener>();
let pending: string[] = [];

export function quoteMarkdown(text: string): string {
  return `${text.replace(/\r\n?/g, '\n').trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
}

export function sendQuote(text: string): void {
  if (!text.trim()) return;
  const markdown = quoteMarkdown(text);
  if (listeners.size) for (const listener of listeners) listener(markdown);
  else pending = [...pending, markdown].slice(-3);
}

export function subscribeQuotes(listener: Listener): () => void {
  listeners.add(listener);
  const queued = pending;
  pending = [];
  for (const markdown of queued) listener(markdown);
  return () => listeners.delete(listener);
}
