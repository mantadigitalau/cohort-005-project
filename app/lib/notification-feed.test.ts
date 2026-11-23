import { describe, it, expect } from "vitest";
import {
  canLoadOlder,
  describeNotification,
  feedReducer,
  initialFeedView,
  type FeedNotification,
  type FeedView,
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

// ─── The feed as the popover holds it ───

function at(
  id: string,
  insertedAt: string,
  overrides: Partial<FeedNotification> = {}
) {
  return feedNotification(approved, { id, insertedAt, ...overrides });
}

const newest = at("msg_3", "2026-10-06T12:00:00.000Z");
const middle = at("msg_2", "2026-10-05T12:00:00.000Z");
const oldest = at("msg_1", "2026-10-04T12:00:00.000Z", { seen: true });

function loaded(
  notifications: FeedNotification[],
  nextCursor: string | null,
  counts = { unseen: 2, unread: 3 }
): FeedView {
  return feedReducer(initialFeedView, {
    type: "first-page",
    page: { notifications, nextCursor, counts },
  });
}

describe("scrolling down the feed", () => {
  it("puts an older page below what's loaded and moves on to its cursor", () => {
    const view = feedReducer(loaded([newest, middle], "cursor_2"), {
      type: "older-page",
      page: {
        notifications: [oldest],
        nextCursor: "cursor_3",
        counts: { unseen: 2, unread: 3 },
      },
    });
    expect(view.notifications.map((n) => n.id)).toEqual([
      "msg_3",
      "msg_2",
      "msg_1",
    ]);
    expect(view.nextCursor).toBe("cursor_3");
  });

  it("asks for an older page while there is history left", () => {
    expect(canLoadOlder(loaded([newest], "cursor_2"))).toBe(true);
  });

  it("stops asking once history runs out", () => {
    expect(canLoadOlder(loaded([newest], null))).toBe(false);
  });

  it("never asks twice at once, so scrolling can't flood Knock", () => {
    const view = feedReducer(loaded([newest], "cursor_2"), {
      type: "loading-older",
    });
    expect(canLoadOlder(view)).toBe(false);
  });

  it("doesn't ask before the first page has arrived", () => {
    expect(canLoadOlder(initialFeedView)).toBe(false);
  });
});

describe("a Notification arriving live", () => {
  const arrived = at("msg_4", "2026-10-07T12:00:00.000Z");

  it("goes to the top of the open feed and updates the badge", () => {
    const view = feedReducer(loaded([newest, middle], "cursor_2"), {
      type: "live",
      update: { notifications: [arrived], counts: { unseen: 3, unread: 4 } },
    });
    expect(view.notifications.map((n) => n.id)).toEqual([
      "msg_4",
      "msg_3",
      "msg_2",
    ]);
    expect(view.counts).toEqual({ unseen: 3, unread: 4 });
  });

  it("leaves where scrolling picks up unchanged", () => {
    const view = feedReducer(loaded([newest], "cursor_2"), {
      type: "live",
      update: { notifications: [arrived], counts: { unseen: 3, unread: 4 } },
    });
    expect(view.nextCursor).toBe("cursor_2");
  });

  it("shows a Notification once, even if it was already loaded", () => {
    const view = feedReducer(loaded([newest, middle], "cursor_2"), {
      type: "live",
      update: { notifications: [newest], counts: { unseen: 2, unread: 3 } },
    });
    expect(view.notifications.map((n) => n.id)).toEqual(["msg_3", "msg_2"]);
  });
});

describe("switching users", () => {
  it("forgets the last user's feed and waits for the new one", () => {
    const view = feedReducer(loaded([newest], "cursor_2"), { type: "reset" });
    expect(view).toEqual({
      notifications: [],
      counts: { unseen: 0, unread: 0 },
      nextCursor: null,
      loading: true,
    });
  });
});

describe("reading Notifications", () => {
  it("marks one row read and takes one off the unread count", () => {
    const view = feedReducer(loaded([newest, middle], null), {
      type: "read",
      notificationId: "msg_2",
    });
    expect(view.notifications.map((n) => n.read)).toEqual([false, true]);
    expect(view.counts.unread).toBe(2);
  });

  it("doesn't count a row twice when it was already read", () => {
    const alreadyRead = at("msg_2", "2026-10-05T12:00:00.000Z", { read: true });
    const view = feedReducer(loaded([newest, alreadyRead], null), {
      type: "read",
      notificationId: "msg_2",
    });
    expect(view.counts.unread).toBe(3);
  });

  it("marks every loaded row read and clears the unread count, loaded or not", () => {
    const view = feedReducer(loaded([newest, middle], "cursor_2"), {
      type: "all-read",
    });
    expect(view.notifications.every((n) => n.read)).toBe(true);
    expect(view.counts).toEqual({ unseen: 2, unread: 0 });
  });

  it("opening the feed clears the badge but leaves rows unread", () => {
    const view = feedReducer(loaded([newest, middle], "cursor_2"), {
      type: "all-seen",
    });
    expect(view.counts).toEqual({ unseen: 0, unread: 3 });
    expect(view.notifications.every((n) => n.seen && !n.read)).toBe(true);
  });
});
