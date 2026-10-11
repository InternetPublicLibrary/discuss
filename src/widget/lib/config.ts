/** Widget settings from the iframe URL (set by client.js from the embed's data-* attributes). */
export type InputPosition = 'top' | 'bottom';
export type CommentOrder = 'oldest' | 'newest';
/** `widget`: comment box (default); `github`: a link to comment on GitHub; `none`: read-only (#16). */
export type InputMode = 'widget' | 'github' | 'none';

export interface WidgetConfig {
  repo: string;
  term: string;
  number: number;
  category: string;
  categoryId: string;
  strict: boolean;
  description: string;
  /** Page title for a new discussion. */
  title: string;
  backLink: string;
  reactionsEnabled: boolean;
  emitMetadata: boolean;
  inputPosition: InputPosition;
  input: InputMode;
  /** Minimised comments: collapsed with their reason (default) or left out (#18). */
  hiddenComments: 'collapse' | 'omit';
  /** Link shown next to the comment box (https only); defaults to the repository's code of conduct. */
  guidelinesUrl: string;
  defaultCommentOrder: CommentOrder;
  theme: string;
  lang: string;
  /** Origin of the embedding IPL page: the only target of postMessage. */
  parentOrigin: string;
}

const safeHttps = (value: string | null) => {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
};

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
    title: params.get('title') ?? '',
    backLink: params.get('backLink') ?? params.get('origin') ?? '',
    reactionsEnabled: flag(params.get('reactionsEnabled'), true),
    emitMetadata: flag(params.get('emitMetadata'), false),
    inputPosition: params.get('inputPosition') === 'top' ? 'top' : 'bottom',
    input: params.get('input') === 'github' || params.get('input') === 'none' ? (params.get('input') as InputMode) : 'widget',
    hiddenComments: params.get('hiddenComments') === 'omit' ? 'omit' : 'collapse',
    guidelinesUrl: safeHttps(params.get('guidelinesUrl')) || (params.get('repo') ? `https://github.com/${params.get('repo')}/blob/HEAD/CODE_OF_CONDUCT.md` : ''),
    defaultCommentOrder: params.get('defaultCommentOrder') === 'newest' ? 'newest' : 'oldest',
    theme: params.get('theme') ?? 'ipl-light',
    lang: params.get('lang') ?? 'en',
    parentOrigin: parentOrigin === 'null' ? '' : parentOrigin,
  };
}

/** The page fields the API needs to find or create the page's discussion on a first write. */
export const pageFields = (config: WidgetConfig) => ({
  repo: config.repo,
  categoryId: config.categoryId,
  category: config.category,
  term: config.term,
  title: config.title,
  description: config.description,
  backLink: config.backLink,
});
