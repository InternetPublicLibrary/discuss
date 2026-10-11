/** GraphQL documents ported from giscus `services/github/getDiscussion.ts`. */
const REACTION_GROUPS = `reactionGroups { content users { totalCount } viewerHasReacted }`;
const AUTHOR = `author { avatarUrl login url }`;
const COMMENT_FIELDS = `id ${AUTHOR} viewerDidAuthor createdAt url authorAssociation lastEditedAt deletedAt isMinimized minimizedReason bodyHTML ${REACTION_GROUPS}`;

export const REPLY_FIELDS = `${COMMENT_FIELDS} replyTo { id }`;

const DISCUSSION_FIELDS = `
  id number url locked viewerDidAuthor author { login }
  repository { nameWithOwner }
  reactions { totalCount }
  ${REACTION_GROUPS}
  comments(first: $first last: $last after: $after before: $before) {
    totalCount
    pageInfo { startCursor hasNextPage hasPreviousPage endCursor }
    nodes {
      ${COMMENT_FIELDS} upvoteCount viewerHasUpvoted viewerCanUpvote
      replies(last: 100) { totalCount pageInfo { hasPreviousPage startCursor } nodes { ${REPLY_FIELDS} } }
    }
  }`;

const PAGINATION = '$first: Int $last: Int $after: String $before: String';
const RATE_LIMIT = 'rateLimit { remaining resetAt cost }';

export const DISCUSSION_BY_SEARCH = `query($query: String! ${PAGINATION}) {
  ${RATE_LIMIT}
  search(type: DISCUSSION last: 10 query: $query) { discussionCount nodes { ... on Discussion { ${DISCUSSION_FIELDS} } } }
}`;

export const DISCUSSION_BY_NUMBER = `query($owner: String! $name: String! $number: Int! ${PAGINATION}) {
  ${RATE_LIMIT}
  repository(owner: $owner, name: $name) { discussion(number: $number) { ${DISCUSSION_FIELDS} } }
}`;
