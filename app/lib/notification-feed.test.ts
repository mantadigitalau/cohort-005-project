import { describe, it, expect } from "vitest";
import { describeNotification, type FeedNotification } from "./notification-feed";

function feedNotification(
  data: FeedNotification["data"],
  overrides: Partial<FeedNotification> = {}
): FeedNotification {
  return {
    id: "msg_1",
    data,
    actor: { name: "Pat Admin", avatarUrl: null },
    insertedAt: "2026-10-06T12:00:00.000Z",
    seen: false,
    read: false,
    ...overrides,
  };
}

const approved = {
  kind: "refund-request-approved",
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  purchaseId: 9,
  amount: 7900,
  decisionNote: null,
} as const;

describe("drawing a Refund Request approved row", () => {
  it("says the Refund Request was approved, under the refund icon", () => {
    expect(describeNotification(feedNotification(approved))).toMatchObject({
      title: "Your Refund Request was approved",
      category: "refund",
    });
  });

  it("names the course and the amount coming back when there's no decision note", () => {
    expect(describeNotification(feedNotification(approved)).snippet).toBe(
      "Test Course · $79.00 on its way back to you"
    );
  });

  it("shows the Platform Admin's decision note when they gave one", () => {
    expect(
      describeNotification(
        feedNotification({ ...approved, decisionNote: "Sorry it wasn't for you." })
      ).snippet
    ).toBe("Test Course · “Sorry it wasn't for you.”");
  });

  it("goes to where the buyer sees their Refund Requests", () => {
    expect(describeNotification(feedNotification(approved)).href).toBe(
      "/settings#refund-requests"
    );
  });
});

const question = {
  kind: "discussion-question",
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  lessonId: 12,
  lessonTitle: "Closures",
  commentId: 40,
  snippet: "How do closures work?",
} as const;

describe("drawing a New Discussion Question row", () => {
  const asked = feedNotification(question, {
    actor: { name: "Ben Learner", avatarUrl: null },
  });

  it("says who asked on which lesson, under the discussion icon", () => {
    expect(describeNotification(asked)).toMatchObject({
      title: "Ben Learner asked a question on Closures",
      category: "discussion",
    });
  });

  it("shows the question's snippet", () => {
    expect(describeNotification(asked).snippet).toBe("How do closures work?");
  });

  it("goes to the question's anchor on the lesson page", () => {
    expect(describeNotification(asked).href).toBe(
      "/courses/test-course/lessons/12#comment-40"
    );
  });
});

describe("drawing a Discussion Reply row", () => {
  const replied = feedNotification(
    {
      ...question,
      kind: "discussion-reply",
      commentId: 41,
      snippet: "Think of a backpack.",
    },
    { actor: { name: "Test Instructor", avatarUrl: null } }
  );

  it("says who replied to your question on which lesson, under the discussion icon", () => {
    expect(describeNotification(replied)).toMatchObject({
      title: "Test Instructor replied to your question on Closures",
      snippet: "Think of a backpack.",
      category: "discussion",
    });
  });

  it("goes to the reply's anchor on the lesson page", () => {
    expect(describeNotification(replied).href).toBe(
      "/courses/test-course/lessons/12#comment-41"
    );
  });
});

describe("drawing a row whose kind the feed doesn't know yet", () => {
  it("still draws a row with nowhere to go, rather than breaking the feed", () => {
    expect(
      describeNotification(feedNotification({ kind: "seat-claimed" }))
    ).toEqual({
      title: "New notification",
      snippet: "",
      category: null,
      href: null,
    });
  });
});
