import { REACTIONS, type Comment, type Discussion, type Reaction, type ReactionGroups, type Reply, type User } from '../../shared/types';

/** GitHub's raw shapes (subset we query). */
export interface GReactionGroup {
  content: string;
  users: { totalCount: number };
  viewerHasReacted: boolean;
}
interface GBase {
  id: string;
  author: User | null;
  viewerDidAuthor: boolean;
  createdAt: string;
  url: string;
  authorAssociation: Comment['authorAssociation'];
  lastEditedAt: string | null;
  deletedAt: string | null;
  isMinimized: boolean;
  minimizedReason: string | null;
  bodyHTML: string;
  reactionGroups: GReactionGroup[];
}
export interface GReply extends GBase {
  replyTo: { id: string } | null;
}
export interface GComment extends GBase {
  upvoteCount: number;
  viewerHasUpvoted: boolean;
  viewerCanUpvote: boolean;
  replies: { totalCount: number; pageInfo?: { hasPreviousPage: boolean; startCursor: string | null }; nodes: GReply[] };
}
export interface GDiscussion {
  id: string;
  number: number;
  url: string;
  locked: boolean;
  /** True when the IPL App (the token used for lookups) created the discussion. */
  viewerDidAuthor?: boolean;
  author?: { login: string } | null;
  repository: { nameWithOwner: string };
  reactions: { totalCount: number };
  reactionGroups: GReactionGroup[];
  comments: { totalCount: number; pageInfo: Discussion['pageInfo']; nodes: GComment[] };
}

/** GitHub returns `null` for deleted accounts; github.com shows them as @ghost. */
const GHOST: User = { avatarUrl: 'https://avatars.githubusercontent.com/u/10137?s=64&v=4', login: 'ghost', url: 'https://github.com/ghost' };

export function adaptReactionGroups(groups: GReactionGroup[]): ReactionGroups {
  const result = Object.fromEntries(Object.keys(REACTIONS).map((key) => [key, { count: 0, viewerHasReacted: false }])) as ReactionGroups;
  for (const group of groups) {
    if (group.content in REACTIONS) result[group.content as Reaction] = { count: group.users.totalCount, viewerHasReacted: group.viewerHasReacted };
  }
  return result;
}

export function adaptReply({ reactionGroups, replyTo, author, ...rest }: GReply): Reply {
  return { ...rest, author: author ?? GHOST, reactions: adaptReactionGroups(reactionGroups), replyToId: replyTo?.id ?? '' };
}

export function adaptComment({ replies, reactionGroups, author, ...rest }: GComment): Comment {
  return {
    ...rest,
    author: author ?? GHOST,
    reactions: adaptReactionGroups(reactionGroups),
    replyCount: replies.totalCount,
    replies: replies.nodes.map(adaptReply),
    repliesStartCursor: replies.pageInfo?.hasPreviousPage ? replies.pageInfo.startCursor : null,
  };
}

export function adaptDiscussion(discussion: GDiscussion): Discussion {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- authorship is checked by the caller, not sent to the widget
  const { comments, reactions, reactionGroups, viewerDidAuthor, author, ...rest } = discussion;
  return {
    ...rest,
    totalCommentCount: comments.totalCount,
    totalReplyCount: comments.nodes.reduce((sum, comment) => sum + comment.replies.totalCount, 0),
    pageInfo: comments.pageInfo,
    reactionCount: reactions.totalCount,
    reactions: adaptReactionGroups(reactionGroups),
    comments: comments.nodes.map(adaptComment),
  };
}
