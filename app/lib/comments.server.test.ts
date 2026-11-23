import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { MAX_COMMENT_LENGTH } from "./comments";
import {
  createComment,
  deleteComment,
  updateComment,
} from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;

  otherLessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 2", position: 2 })
    .returning()
    .get().id;
});

function ask(userId: number, body = "How do closures work?") {
  return createComment(db, userId, lessonId, null, body, NOW);
}

describe("createComment", () => {
  it("creates a Discussion Question with a trimmed body", () => {
    const question = createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  How do closures work?  ",
      NOW
    );

    expect(question).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "How do closures work?",
      createdAt: NOW.toISOString(),
      deletedAt: null,
    });
  });

  it("creates a Discussion Reply under a question on the same lesson", () => {
    const question = ask(base.user.id);

    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Think of a backpack.",
      NOW
    );

    expect(reply).toMatchObject({
      userId: base.instructor.id,
      lessonId,
      parentId: question.id,
      body: "Think of a backpack.",
    });
  });

  it("refuses a reply to a reply", () => {
    const question = ask(base.user.id);
    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "An answer",
      NOW
    );

    expect(() =>
      createComment(db, base.user.id, lessonId, reply.id, "Thanks!", NOW)
    ).toThrow("Replies can only be one level deep");
  });

  it("refuses a reply to a question on a different lesson", () => {
    const question = ask(base.user.id);

    expect(() =>
      createComment(db, base.user.id, otherLessonId, question.id, "Hi", NOW)
    ).toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses a reply to a comment that doesn't exist", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, 9999, "Hi", NOW)
    ).toThrow("Parent comment not found");
  });

  it("refuses an empty body", () => {
    expect(() =>
      createComment(db, base.user.id, lessonId, null, "   ", NOW)
    ).toThrow("Comment cannot be empty");
  });

  it("refuses a body over the length limit", () => {
    expect(() =>
      createComment(
        db,
        base.user.id,
        lessonId,
        null,
        "x".repeat(MAX_COMMENT_LENGTH + 1),
        NOW
      )
    ).toThrow(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`);
  });

  it("refuses a comment on a lesson that doesn't exist", () => {
    expect(() =>
      createComment(db, base.user.id, 9999, null, "Hi", NOW)
    ).toThrow("Lesson not found");
  });
});

describe("deleteComment", () => {
  const LATER = new Date(2026, 9, 7, 9, 0, 0);

  it("lets the author soft-delete their own comment", () => {
    const question = ask(base.user.id);

    const deleted = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(deleted).toMatchObject({
      id: question.id,
      body: "How do closures work?",
      deletedAt: LATER.toISOString(),
    });
  });

  it("lets staff soft-delete someone else's comment", () => {
    const question = ask(base.user.id);

    const deleted = deleteComment(
      db,
      question.id,
      base.instructor.id,
      true,
      LATER
    );

    expect(deleted.deletedAt).toBe(LATER.toISOString());
  });

  it("refuses someone who is neither the author nor staff", () => {
    const question = ask(base.user.id);

    expect(() =>
      deleteComment(db, question.id, base.instructor.id, false, LATER)
    ).toThrow("You can only delete your own comments");
  });

  it("keeps the first deletion time when deleted again", () => {
    const question = ask(base.user.id);
    deleteComment(db, question.id, base.user.id, false, NOW);

    const again = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(again.deletedAt).toBe(NOW.toISOString());
  });

  it("refuses a comment that doesn't exist", () => {
    expect(() => deleteComment(db, 9999, base.user.id, true, LATER)).toThrow(
      "Comment not found"
    );
  });
});

describe("updateComment", () => {
  const LATER = new Date(2026, 9, 7, 9, 0, 0);

  it("lets the author edit their comment and marks it edited", () => {
    const question = ask(base.user.id);

    const edited = updateComment(
      db,
      question.id,
      base.user.id,
      "  How do closures capture variables?  ",
      LATER
    );

    expect(edited).toMatchObject({
      body: "How do closures capture variables?",
      editedAt: LATER.toISOString(),
    });
  });

  it("refuses anyone but the author, even staff", () => {
    const question = ask(base.user.id);

    expect(() =>
      updateComment(db, question.id, base.instructor.id, "Edited", LATER)
    ).toThrow("You can only edit your own comments");
  });

  it("refuses a deleted comment", () => {
    const question = ask(base.user.id);
    deleteComment(db, question.id, base.user.id, false, NOW);

    expect(() =>
      updateComment(db, question.id, base.user.id, "Edited", LATER)
    ).toThrow("Comment has been deleted");
  });
});
