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
