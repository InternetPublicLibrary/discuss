/** Widget settings from the iframe URL (set by client.js from the embed's data-* attributes). */
export type InputPosition = 'top' | 'bottom';
export type CommentOrder = 'oldest' | 'newest';

export interface WidgetConfig {
  repo: string;
  term: string;
  number: number;
  category: string;
  categoryId: string;
  strict: boolean;
  description: string;
  backLink: string;
  reactionsEnabled: boolean;
  emitMetadata: boolean;
  inputPosition: InputPosition;
  defaultCommentOrder: CommentOrder;
  theme: string;
  lang: string;
  /** Origin of the embedding IPL page: the only target of postMessage. */
  parentOrigin: string;
}

const flag = (value: string | null, fallback: boolean) => (value === null ? fallback : value === '1' || value === 'true');

export function readConfig(search: string): WidgetConfig {
  const params = new URLSearchParams(search);
  let parentOrigin: string;
  try {
    parentOrigin = new URL(params.get('origin') ?? '').origin;
  } catch {
    parentOrigin = '';
  }
  const number = Number(params.get('number') ?? 0);
  return {
    repo: params.get('repo') ?? '',
    term: params.get('term') ?? '',
    number: Number.isInteger(number) && number > 0 ? number : 0,
    category: params.get('category') ?? '',
    categoryId: params.get('categoryId') ?? '',
    strict: flag(params.get('strict'), false),
    description: params.get('description') ?? '',
    backLink: params.get('backLink') ?? params.get('origin') ?? '',
    reactionsEnabled: flag(params.get('reactionsEnabled'), true),
    emitMetadata: flag(params.get('emitMetadata'), false),
    inputPosition: params.get('inputPosition') === 'top' ? 'top' : 'bottom',
    defaultCommentOrder: params.get('defaultCommentOrder') === 'newest' ? 'newest' : 'oldest',
    theme: params.get('theme') ?? 'light',
    lang: params.get('lang') ?? 'en',
    parentOrigin: parentOrigin === 'null' ? '' : parentOrigin,
  };
}
