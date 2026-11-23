export const MIN_COMMENT_LENGTH = 1;
export const MAX_COMMENT_LENGTH = 5000;

/**
 * The element id a comment has on its lesson page, so a link can land on it
 * (`#comment-42`). Discussion Notifications link here.
 */
export function commentAnchorId(commentId: number | string): string {
  return `comment-${commentId}`;
}
