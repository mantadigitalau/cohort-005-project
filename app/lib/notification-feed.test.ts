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

const declined = {
  kind: "refund-request-declined",
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  purchaseId: 9,
  amount: 7900,
  decisionNote: "You finished the course.",
} as const;

describe("drawing a Refund Request declined row", () => {
  it("says the Refund Request was declined, under the refund icon", () => {
    expect(describeNotification(feedNotification(declined))).toMatchObject({
      title: "Your Refund Request was declined",
      category: "refund",
    });
  });

  it("shows the decision note and that the buyer can ask again", () => {
    expect(describeNotification(feedNotification(declined)).snippet).toBe(
      "Test Course · “You finished the course.” · You can ask again"
    );
  });

  it("goes to where the buyer sees their Refund Requests", () => {
    expect(describeNotification(feedNotification(declined)).href).toBe(
      "/settings#refund-requests"
    );
  });
});

const confirmation = {
  kind: "refund-request-confirmation",
  refundRequestId: 12,
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  purchaseId: 9,
  amount: 7900,
} as const;

describe("drawing a Refund Request confirmation row", () => {
  it("says the Refund Request is under review, naming the course and amount", () => {
    expect(
      describeNotification(feedNotification(confirmation, { actor: null }))
    ).toMatchObject({
      title: "Your Refund Request is under review",
      snippet: "Test Course · $79.00",
      category: "refund",
    });
  });

  it("goes nowhere, so clicking it only marks it read", () => {
    expect(
      describeNotification(feedNotification(confirmation, { actor: null })).href
    ).toBeNull();
  });
});

const openRefundRequest = {
  kind: "open-refund-request",
  refundRequestId: 12,
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  purchaseId: 9,
  amount: 7900,
  reason: "It was not what I expected.",
  buyerName: "Liam Student",
} as const;

describe("drawing an Open Refund Request row", () => {
  it("says who asked for a refund, under the refund icon", () => {
    expect(
      describeNotification(feedNotification(openRefundRequest))
    ).toMatchObject({
      title: "Liam Student asked for a refund",
      category: "refund",
    });
  });

  it("shows the course, the amount and the reason", () => {
    expect(
      describeNotification(feedNotification(openRefundRequest)).snippet
    ).toBe("Test Course · $79.00 · “It was not what I expected.”");
  });

  it("goes to the refund review page", () => {
    expect(
      describeNotification(feedNotification(openRefundRequest)).href
    ).toBe("/admin/refunds");
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
