import { eq } from "drizzle-orm";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import {
  notifySafely,
  type Notification,
  type NotificationPort,
  type NotificationUser,
} from "~/lib/notifications.server";
import type { Db } from "~/lib/refunds.server";

// ─── Comments ───
// Writing Discussion Questions and Discussion Replies: creating, editing and
// soft-deleting them. Every route that writes a comment goes through here, so
// the rules live in one place.
//
// Every function takes the database first and the time last, so tests can hand
// in an in-memory database and a fixed clock. Creating and deleting a
// comment also take the Notification port, after the clock, like the refunds service. Failures a person can correct
// (empty body, not your comment) throw an Error whose message is shown to them.

function getComment(db: Db, commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function getCourseForLesson(db: Db, lessonId: number) {
  return db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
      lessonTitle: lessons.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function assertValidBody(body: string) {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

/**
 * Creates a Discussion Question (`parentId` null) or a Discussion Reply to a
 * top-level comment on the same lesson. Replies are one level deep only.
 *
 * Once written, it notifies whoever it concerns: a Question the course's
 * Instructor (unless they asked it), a Reply the Question's author (unless
 * they wrote it). A failed Notification never fails the comment.
 */
export async function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date,
  notifier: NotificationPort
) {
  const trimmed = assertValidBody(body);

  const lesson = getCourseForLesson(db, lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  let parent: typeof comments.$inferSelect | undefined;
  if (parentId !== null) {
    parent = getComment(db, parentId);
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  const comment = db
    .insert(comments)
    .values({
      userId,
      lessonId,
      parentId,
      body: trimmed,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();

  // A Question goes to the course's Instructor; a Reply only to the
  // Question's author, never to others in the thread.
  const recipientId = parent ? parent.userId : lesson.instructorId;
  // Nobody is notified of their own action.
  if (recipientId !== null && recipientId !== userId) {
    await notifySafely(notifier, () =>
      commentNotification(db, comment, recipientId)
    );
  }

  return comment;
}

/** The longest snippet a Notification carries. */
const SNIPPET_LENGTH = 140;

/** A comment's body on one line, cut short if it's long. */
function snippetOf(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_LENGTH
    ? `${oneLine.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…`
    : oneLine;
}

function toNotificationUser(user: typeof users.$inferSelect): NotificationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

function getUser(db: Db, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`User ${userId} not found.`);
  return user;
}

/**
 * A new comment's Notification, from its author. `data` stays flat and scalar
 * so the vendor can find it by `commentId` when the comment is deleted. It's a
 * snapshot: editing the comment later doesn't change it.
 */
function commentNotification(
  db: Db,
  comment: typeof comments.$inferSelect,
  recipientId: number
): Notification {
  const lesson = getCourseForLesson(db, comment.lessonId);
  if (!lesson) throw new Error(`Lesson ${comment.lessonId} not found.`);

  const kind =
    comment.parentId === null ? "discussion-question" : "discussion-reply";

  return {
    kind,
    recipients: [toNotificationUser(getUser(db, recipientId))],
    actor: toNotificationUser(getUser(db, comment.userId)),
    data: {
      kind,
      courseId: lesson.courseId,
      courseTitle: lesson.courseTitle,
      courseSlug: lesson.courseSlug,
      lessonId: comment.lessonId,
      lessonTitle: lesson.lessonTitle,
      commentId: comment.id,
      snippet: snippetOf(comment.body),
    },
    idempotencyKey: `${kind}:${comment.id}`,
  };
}

/**
 * Soft-deletes a comment. Its author may delete it, and so may staff (the
 * course's Instructor or a Platform Admin), which the caller decides. Deleting
 * an already-deleted comment is a no-op that keeps the first deletion time.
 *
 * Once deleted, the Notifications this comment caused are archived, so they
 * leave the recipient's feed. Only this comment's: deleting a Question leaves
 * its Replies' Notifications alone, as those Replies stay visible. A failed
 * archive never fails the delete.
 */
export async function deleteComment(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean,
  now: Date,
  notifier: NotificationPort
) {
  const existing = getComment(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.userId !== userId && !isStaff) {
    throw new Error("You can only delete your own comments");
  }
  if (existing.deletedAt !== null) {
    return existing;
  }

  const deleted = db
    .update(comments)
    .set({ deletedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  await archiveSafely(notifier, commentId);

  return deleted;
}

/** Like notifySafely: a failed archive is logged and swallowed. */
async function archiveSafely(notifier: NotificationPort, commentId: number) {
  try {
    await notifier.archiveByComment(commentId);
  } catch (error) {
    console.error(
      `[notifications] archiving comment ${commentId}'s Notifications failed:`,
      error
    );
  }
}

/** Edits a comment's body. Only its author may, and not once it's deleted. */
export function updateComment(
  db: Db,
  commentId: number,
  userId: number,
  body: string,
  now: Date
) {
  const trimmed = assertValidBody(body);
  const existing = getComment(db, commentId);
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.deletedAt !== null) {
    throw new Error("Comment has been deleted");
  }
  if (existing.userId !== userId) {
    throw new Error("You can only edit your own comments");
  }

  return db
    .update(comments)
    .set({ body: trimmed, editedAt: now.toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();
}
