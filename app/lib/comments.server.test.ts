import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { MAX_COMMENT_LENGTH } from "./comments";
import { createFakeNotifier, type FakeNotifier } from "./notifications.server";
import {
  createComment,
  deleteComment,
  updateComment,
} from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let notifier: FakeNotifier;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

beforeEach(() => {
  db = createTestDb();
  notifier = createFakeNotifier();
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

function addUser(
  name: string,
  role: schema.UserRole = schema.UserRole.Student
) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.split(" ")[0].toLowerCase()}@example.com`,
      role,
    })
    .returning()
    .get();
}

function ask(userId: number, body = "How do closures work?") {
  return createComment(db, userId, lessonId, null, body, NOW, notifier);
}

describe("createComment", () => {
  it("creates a Discussion Question with a trimmed body", async () => {
    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "  How do closures work?  ",
      NOW,
      notifier
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

  it("creates a Discussion Reply under a question on the same lesson", async () => {
    const question = await ask(base.user.id);

    const reply = await createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Think of a backpack.",
      NOW,
      notifier
    );

    expect(reply).toMatchObject({
      userId: base.instructor.id,
      lessonId,
      parentId: question.id,
      body: "Think of a backpack.",
    });
  });

  it("refuses a reply to a reply", async () => {
    const question = await ask(base.user.id);
    const reply = await createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "An answer",
      NOW,
      notifier
    );

    await expect(
      createComment(
        db,
        base.user.id,
        lessonId,
        reply.id,
        "Thanks!",
        NOW,
        notifier
      )
    ).rejects.toThrow("Replies can only be one level deep");
  });

  it("refuses a reply to a question on a different lesson", async () => {
    const question = await ask(base.user.id);

    await expect(
      createComment(
        db,
        base.user.id,
        otherLessonId,
        question.id,
        "Hi",
        NOW,
        notifier
      )
    ).rejects.toThrow("Parent comment belongs to a different lesson");
  });

  it("refuses a reply to a comment that doesn't exist", async () => {
    await expect(
      createComment(db, base.user.id, lessonId, 9999, "Hi", NOW, notifier)
    ).rejects.toThrow("Parent comment not found");
  });

  it("refuses an empty body", async () => {
    await expect(
      createComment(db, base.user.id, lessonId, null, "   ", NOW, notifier)
    ).rejects.toThrow("Comment cannot be empty");
  });

  it("refuses a body over the length limit", async () => {
    await expect(
      createComment(
        db,
        base.user.id,
        lessonId,
        null,
        "x".repeat(MAX_COMMENT_LENGTH + 1),
        NOW,
        notifier
      )
    ).rejects.toThrow(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  });

  it("refuses a comment on a lesson that doesn't exist", async () => {
    await expect(
      createComment(db, base.user.id, 9999, null, "Hi", NOW, notifier)
    ).rejects.toThrow("Lesson not found");
  });
});

describe("notifying about a Discussion Question", () => {
  it("sends New Discussion Question to the course's Instructor, from the asker", async () => {
    const question = await ask(base.user.id, "How do closures work?");

    expect(notifier.triggers).toEqual([
      {
        kind: "discussion-question",
        recipients: [
          {
            id: base.instructor.id,
            name: "Test Instructor",
            email: "instructor@example.com",
            avatarUrl: null,
          },
        ],
        actor: {
          id: base.user.id,
          name: "Test User",
          email: "test@example.com",
          avatarUrl: null,
        },
        data: {
          kind: "discussion-question",
          courseId: base.course.id,
          courseTitle: "Test Course",
          courseSlug: "test-course",
          lessonId,
          lessonTitle: "Lesson 1",
          commentId: question.id,
          snippet: "How do closures work?",
        },
        idempotencyKey: `discussion-question:${question.id}`,
      },
    ]);
  });

  it("sends nothing when the Instructor asks on their own course", async () => {
    await ask(base.instructor.id);

    expect(notifier.triggers).toEqual([]);
  });

  it("notifies the Instructor of a Platform Admin's question", async () => {
    const platformAdmin = addUser("Pat Admin", schema.UserRole.Admin);

    await ask(platformAdmin.id);

    expect(notifier.triggers).toHaveLength(1);
    expect(notifier.triggers[0]).toMatchObject({
      kind: "discussion-question",
      recipients: [{ id: base.instructor.id }],
      actor: { id: platformAdmin.id, name: "Pat Admin" },
    });
  });
});

describe("notifying about a Discussion Reply", () => {
  function reply(userId: number, questionId: number, body = "A reply") {
    return createComment(db, userId, lessonId, questionId, body, NOW, notifier);
  }

  it("sends Discussion Reply to the question's author, from the replier", async () => {
    const question = await ask(base.user.id);
    notifier.triggers.length = 0;

    const answer = await reply(
      base.instructor.id,
      question.id,
      "Think of a backpack."
    );

    expect(notifier.triggers).toEqual([
      {
        kind: "discussion-reply",
        recipients: [
          {
            id: base.user.id,
            name: "Test User",
            email: "test@example.com",
            avatarUrl: null,
          },
        ],
        actor: {
          id: base.instructor.id,
          name: "Test Instructor",
          email: "instructor@example.com",
          avatarUrl: null,
        },
        data: {
          kind: "discussion-reply",
          courseId: base.course.id,
          courseTitle: "Test Course",
          courseSlug: "test-course",
          lessonId,
          lessonTitle: "Lesson 1",
          commentId: answer.id,
          snippet: "Think of a backpack.",
        },
        idempotencyKey: `discussion-reply:${answer.id}`,
      },
    ]);
  });

  it("notifies only the question's author, never others in the thread", async () => {
    const ben = addUser("Ben");
    const question = await ask(base.user.id);
    await reply(ben.id, question.id, "Me too!");
    notifier.triggers.length = 0;

    await reply(base.instructor.id, question.id);

    expect(notifier.triggers.map((sent) => sent.recipients)).toEqual([
      [expect.objectContaining({ id: base.user.id })],
    ]);
  });

  it("sends nothing when the author replies in their own thread", async () => {
    const question = await ask(base.user.id);
    notifier.triggers.length = 0;

    await reply(base.user.id, question.id, "Never mind, got it.");

    expect(notifier.triggers).toEqual([]);
  });
});

describe("a Notification that fails to send", () => {
  it("still creates the comment", async () => {
    const failing = createFakeNotifier();
    failing.trigger = async () => {
      throw new Error("Knock is down");
    };
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const question = await createComment(
      db,
      base.user.id,
      lessonId,
      null,
      "How do closures work?",
      NOW,
      failing
    );

    expect(question).toMatchObject({ body: "How do closures work?" });
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});

describe("a long comment's snippet", () => {
  it("is cut to one line of 140 characters", async () => {
    await ask(base.user.id, `First line\n\n${"word ".repeat(60)}`);

    const snippet = String(notifier.triggers[0].data.snippet);
    expect(snippet.startsWith("First line word word")).toBe(true);
    expect(snippet).not.toContain("\n");
    expect(snippet).toHaveLength(140);
    expect(snippet.endsWith("…")).toBe(true);
  });
});

describe("deleteComment", () => {
  const LATER = new Date(2026, 9, 7, 9, 0, 0);

  it("lets the author soft-delete their own comment", async () => {
    const question = await ask(base.user.id);

    const deleted = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(deleted).toMatchObject({
      id: question.id,
      body: "How do closures work?",
      deletedAt: LATER.toISOString(),
    });
  });

  it("lets staff soft-delete someone else's comment", async () => {
    const question = await ask(base.user.id);

    const deleted = deleteComment(
      db,
      question.id,
      base.instructor.id,
      true,
      LATER
    );

    expect(deleted.deletedAt).toBe(LATER.toISOString());
  });

  it("refuses someone who is neither the author nor staff", async () => {
    const question = await ask(base.user.id);

    expect(() =>
      deleteComment(db, question.id, base.instructor.id, false, LATER)
    ).toThrow("You can only delete your own comments");
  });

  it("keeps the first deletion time when deleted again", async () => {
    const question = await ask(base.user.id);
    deleteComment(db, question.id, base.user.id, false, NOW);

    const again = deleteComment(db, question.id, base.user.id, false, LATER);

    expect(again.deletedAt).toBe(NOW.toISOString());
  });

  it("refuses a comment that doesn't exist", async () => {
    expect(() => deleteComment(db, 9999, base.user.id, true, LATER)).toThrow(
      "Comment not found"
    );
  });
});

describe("updateComment", () => {
  const LATER = new Date(2026, 9, 7, 9, 0, 0);

  it("lets the author edit their comment and marks it edited", async () => {
    const question = await ask(base.user.id);

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

  it("refuses anyone but the author, even staff", async () => {
    const question = await ask(base.user.id);

    expect(() =>
      updateComment(db, question.id, base.instructor.id, "Edited", LATER)
    ).toThrow("You can only edit your own comments");
  });

  it("refuses a deleted comment", async () => {
    const question = await ask(base.user.id);
    deleteComment(db, question.id, base.user.id, false, NOW);

    expect(() =>
      updateComment(db, question.id, base.user.id, "Edited", LATER)
    ).toThrow("Comment has been deleted");
  });
});
