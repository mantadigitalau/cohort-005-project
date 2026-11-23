import { describe, it, expect } from "vitest";
import {
  describeNotification,
  type FeedNotification,
} from "./notification-feed";

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
        feedNotification({
          ...approved,
          decisionNote: "Sorry it wasn't for you.",
        })
      ).snippet
    ).toBe("Test Course · “Sorry it wasn't for you.”");
  });

  it("goes to where the buyer sees their Refund Requests", () => {
    expect(describeNotification(feedNotification(approved)).href).toBe(
      "/settings#refund-requests"
    );
  });
});

const enrolled = {
  kind: "new-enrollment",
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  enrollmentId: 12,
} as const;

describe("drawing a New Enrollment row", () => {
  it("says which Student enrolled, under the enrollment icon", () => {
    expect(
      describeNotification(
        feedNotification(enrolled, {
          actor: { name: "Sam Student", avatarUrl: null },
        })
      )
    ).toMatchObject({
      title: "Sam Student enrolled",
      snippet: "Test Course",
      category: "enrollment",
    });
  });

  it("goes to the course's students page", () => {
    expect(describeNotification(feedNotification(enrolled)).href).toBe(
      "/instructor/3/students"
    );
  });
});

const seatClaimed = {
  kind: "seat-claimed",
  courseId: 3,
  courseTitle: "Test Course",
  courseSlug: "test-course",
  seatId: 40,
  seatsLeft: 2,
} as const;

describe("drawing a Seat claimed row", () => {
  it("says who claimed a Seat, under the team icon", () => {
    expect(
      describeNotification(
        feedNotification(seatClaimed, {
          actor: { name: "Sam Student", avatarUrl: null },
        })
      )
    ).toMatchObject({ title: "Sam Student claimed a Seat", category: "team" });
  });

  it("names the course and how many Seats are left", () => {
    expect(describeNotification(feedNotification(seatClaimed)).snippet).toBe(
      "Test Course · 2 Seats left"
    );
    expect(
      describeNotification(feedNotification({ ...seatClaimed, seatsLeft: 1 }))
        .snippet
    ).toBe("Test Course · 1 Seat left");
    expect(
      describeNotification(feedNotification({ ...seatClaimed, seatsLeft: 0 }))
        .snippet
    ).toBe("Test Course · No Seats left");
  });

  it("goes to the team page", () => {
    expect(describeNotification(feedNotification(seatClaimed)).href).toBe(
      "/team"
    );
  });
});

describe("drawing a row whose kind the feed doesn't know yet", () => {
  it("still draws a row with nowhere to go, rather than breaking the feed", () => {
    expect(
      describeNotification(feedNotification({ kind: "discussion-reply" }))
    ).toEqual({
      title: "New notification",
      snippet: "",
      category: null,
      href: null,
    });
  });
});
