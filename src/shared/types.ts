/** Data the API returns to the widget (adapted from GitHub's GraphQL, as upstream giscus did). */
export const REACTIONS = {
  THUMBS_UP: '👍',
  THUMBS_DOWN: '👎',
  LAUGH: '😄',
  HOORAY: '🎉',
  CONFUSED: '😕',
  HEART: '❤️',
  ROCKET: '🚀',
  EYES: '👀',
} as const;
export type Reaction = keyof typeof REACTIONS;

export interface User {
  avatarUrl: string;
  login: string;
  url: string;
}

export type ReactionGroups = Record<Reaction, { count: number; viewerHasReacted: boolean }>;

export type AuthorAssociation =
  | 'COLLABORATOR' | 'CONTRIBUTOR' | 'FIRST_TIMER' | 'FIRST_TIME_CONTRIBUTOR' | 'MANNEQUIN' | 'MEMBER' | 'NONE' | 'OWNER' | 'APP';

interface BaseComment {
  id: string;
  author: User;
  viewerDidAuthor: boolean;
  createdAt: string;
  url: string;
  authorAssociation: AuthorAssociation;
  lastEditedAt: string | null;
  deletedAt: string | null;
  isMinimized: boolean;
  minimizedReason: string | null;
  bodyHTML: string;
  reactions: ReactionGroups;
  /** Set when the IPL App posted this for an ORCID reader (spec 003); then `author` is the bot and is not shown. */
  orcidAuthor?: { id: string; name: string; profileUrl: string };
}

export interface Reply extends BaseComment {
  replyToId: string;
}

export interface Comment extends BaseComment {
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  viewerCanUpvote: boolean;
  replyCount: number;
  replies: Reply[];
  /** Cursor to load older replies than the ones included (null when all are included). */
  repliesStartCursor: string | null;
}

export interface PageInfo {
  startCursor: string | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
}

export interface Discussion {
  id: string;
  number: number;
  url: string;
  locked: boolean;
  totalCommentCount: number;
  totalReplyCount: number;
  pageInfo: PageInfo;
  repository: { nameWithOwner: string };
  reactionCount: number;
  reactions: ReactionGroups;
  comments: Comment[];
}

export interface DiscussionPage {
  /** Null for anonymous readers. */
  viewer: User | null;
  discussion: Discussion;
}
