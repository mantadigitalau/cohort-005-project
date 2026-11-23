import { z } from "zod";
import {
  NOTIFICATION_KINDS,
  type NotificationData,
  type NotificationKind,
} from "~/lib/notification-kinds";
import { commentAnchorId } from "~/lib/comments";
import { formatPrice } from "~/lib/utils";

// ─── Client feed port ───
// How the browser reads the session user's Notification Feed, in Cadence's
// own words. Feed components only ever call this port. Its Knock adapter is
// knock-feed.client.ts (docs/adr/0013); `emptyFeed` stands in when there are
// no Knock keys.

/** What the server hands the browser so it can open the user's feed. */
export type NotificationFeedSession = {
  /** The vendor's id for the session user. */
  userId: string;
  /** Signed for this user only: it can't read another user's feed. */
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
};

/** One Notification as the Notification Feed shows it. */
export type FeedNotification = {
  id: string;
  /**
   * Null when the feed can't read it: a kind this build doesn't know yet, or
   * a shape that isn't Cadence's. It still draws as a plain row.
   */
  data: NotificationData | null;
  /** Who caused it. Null for Notifications from Cadence itself. */
  actor: { name: string; avatarUrl: string | null } | null;
  insertedAt: string;
  seen: boolean;
  read: boolean;
};

export type FeedCounts = { unseen: number; unread: number };

export type FeedPage = {
  /** Newest first. */
  notifications: FeedNotification[];
  /** Pass as `after` for the next (older) page. Null on the last page. */
  nextCursor: string | null;
  counts: FeedCounts;
};

/** What arrives live, without a reload. */
export type FeedUpdate = {
  notifications: FeedNotification[];
  counts: FeedCounts;
};

export interface NotificationFeedPort {
  /** One page of the feed, newest first. Omit `after` for the first page. */
  listNotifications(options?: { after?: string | null }): Promise<FeedPage>;
  /** The latest unseen and unread counts. */
  getCounts(): Promise<FeedCounts>;
  markRead(notificationId: string): Promise<void>;
  /** Every Notification in the channel, loaded or not. Seen isn't read. */
  markAllSeen(): Promise<void>;
  /** Every Notification in the channel, loaded or not. */
  markAllRead(): Promise<void>;
  /** Live updates. Returns a function that stops listening. */
  subscribe(listener: (update: FeedUpdate) => void): () => void;
  /** Drops the session: closes the socket and forgets the user. */
  dispose(): void;
}

const NO_COUNTS: FeedCounts = { unseen: 0, unread: 0 };

/** The feed without Knock keys: always "You're all caught up." */
export function emptyFeed(): NotificationFeedPort {
  return {
    async listNotifications() {
      return { notifications: [], nextCursor: null, counts: NO_COUNTS };
    },
    async getCounts() {
      return NO_COUNTS;
    },
    async markRead() {},
    async markAllSeen() {},
    async markAllRead() {},
    subscribe() {
      return () => {};
    },
    dispose() {},
  };
}

/** The vendor hands back whatever was sent: parse it, don't trust it. */
const notificationDataSchema = z
  .object({ kind: z.enum(NOTIFICATION_KINDS) })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));

/** A Notification's `data` as the vendor returned it, or null if unreadable. */
export function parseNotificationData(raw: unknown): NotificationData | null {
  const parsed = notificationDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ─── The feed as the popover holds it ───
// What the bell shows, built from pages, live updates and the user's own
// reads. Pure, so the popover's rules live here rather than in a hook.

export type FeedView = {
  /** Newest first, one entry per Notification. */
  notifications: FeedNotification[];
  counts: FeedCounts;
  /** Where the next older page starts. Null once history runs out. */
  nextCursor: string | null;
  /** True until the first page arrives, and while an older page loads. */
  loading: boolean;
};

export type FeedEvent =
  /** A different user: start over. */
  | { type: "reset" }
  | { type: "first-page"; page: FeedPage }
  | { type: "loading-older" }
  | { type: "older-page"; page: FeedPage }
  | { type: "load-failed" }
  /** Fetching the first page again, e.g. on opening the popover. */
  | { type: "refreshing" }
  /** The first page again: it replaces every loaded row. */
  | { type: "refreshed"; page: FeedPage }
  | { type: "live"; update: FeedUpdate }
  | { type: "read"; notificationId: string }
  /** Every Notification, loaded or not. */
  | { type: "all-read" }
  /** Every Notification, loaded or not. Seen isn't read. */
  | { type: "all-seen" };

export const initialFeedView: FeedView = {
  notifications: [],
  counts: NO_COUNTS,
  nextCursor: null,
  loading: true,
};

/** Newest first, one entry per Notification; the incoming copy wins. */
function merge(
  current: FeedNotification[],
  incoming: FeedNotification[]
): FeedNotification[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const notification of incoming) byId.set(notification.id, notification);
  return [...byId.values()].sort((a, b) =>
    b.insertedAt.localeCompare(a.insertedAt)
  );
}

export function feedReducer(view: FeedView, event: FeedEvent): FeedView {
  switch (event.type) {
    case "reset":
      return initialFeedView;
    case "first-page":
      return {
        notifications: merge([], event.page.notifications),
        counts: event.page.counts,
        nextCursor: event.page.nextCursor,
        loading: false,
      };
    case "loading-older":
      return { ...view, loading: true };
    case "older-page":
      return {
        notifications: merge(view.notifications, event.page.notifications),
        counts: event.page.counts,
        nextCursor: event.page.nextCursor,
        loading: false,
      };
    case "load-failed":
      return { ...view, loading: false };
    case "refreshing":
      return { ...view, loading: true };
    case "refreshed":
      return refreshed(view, event.page);
    case "live":
      return {
        ...view,
        notifications: merge(view.notifications, event.update.notifications),
        counts: event.update.counts,
      };
    case "read": {
      const target = view.notifications.find(
        (n) => n.id === event.notificationId
      );
      if (!target || target.read) return view;
      return {
        ...view,
        notifications: view.notifications.map((n) =>
          n.id === event.notificationId ? { ...n, read: true } : n
        ),
        counts: {
          ...view.counts,
          unread: Math.max(0, view.counts.unread - 1),
        },
      };
    }
    case "all-read":
      return {
        ...view,
        notifications: view.notifications.map((n) => ({ ...n, read: true })),
        counts: { ...view.counts, unread: 0 },
      };
    case "all-seen":
      return {
        ...view,
        notifications: view.notifications.map((n) => ({ ...n, seen: true })),
        counts: { ...view.counts, unseen: 0 },
      };
  }
}

/**
 * The first page fetched again replaces every loaded row, so a Notification
 * archived since (its comment was deleted) leaves the feed, and so do older
 * pages: scrolling starts again from this page's cursor.
 *
 * Reads and seens made while it loaded may not have reached Knock yet, so a
 * row the person already read or saw stays that way, and neither count goes
 * back up. A count only drops here (an archived unread row); a new
 * Notification raises it through a live update instead.
 */
function refreshed(view: FeedView, page: FeedPage): FeedView {
  const local = new Map(view.notifications.map((n) => [n.id, n]));
  return {
    notifications: merge(
      [],
      page.notifications.map((notification) => {
        const before = local.get(notification.id);
        return before
          ? {
              ...notification,
              seen: notification.seen || before.seen,
              read: notification.read || before.read,
            }
          : notification;
      })
    ),
    counts: {
      unseen: Math.min(view.counts.unseen, page.counts.unseen),
      unread: Math.min(view.counts.unread, page.counts.unread),
    },
    nextCursor: page.nextCursor,
    loading: false,
  };
}

/** The least time between two fetches of the first page. */
export const FEED_REFRESH_INTERVAL_MS = 15_000;

/**
 * Whether opening the popover should fetch the first page again. Not while
 * a page is loading, and not more than once per interval, so opening and
 * closing quickly can't flood Knock (it answers with 429). No polling: it
 * only ever runs when the person opens the feed.
 */
export function canRefresh(
  view: FeedView,
  lastFetchedAt: number | null,
  now: number
): boolean {
  if (view.loading) return false;
  return (
    lastFetchedAt === null || now - lastFetchedAt >= FEED_REFRESH_INTERVAL_MS
  );
}

/** One request at a time, and only while history is left: no 429s. */
export function canLoadOlder(view: FeedView): boolean {
  return !view.loading && view.nextCursor !== null;
}

// ─── Drawing a row ───
// A row's title, snippet, icon and link come from the Notification's `data`,
// never from vendor templates. Each kind has its own entry below; a kind
// without one still draws a plain row with nowhere to go.

/** The small icon inset at the corner of a row's avatar. */
export type FeedCategory = "discussion" | "refund" | "team" | "enrollment";

export type FeedRow = {
  title: string;
  /** One line of context. */
  snippet: string;
  category: FeedCategory | null;
  /** Where clicking the row goes. Null: it only marks itself read. */
  href: string | null;
};

type RowFor = (
  notification: FeedNotification & { data: NotificationData }
) => FeedRow;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function quoted(value: unknown): string | null {
  const note = text(value).trim();
  return note ? `“${note}”` : null;
}

/** The comment itself on its lesson page, not just the lesson. */
function commentHref(data: NotificationData): string {
  return `/courses/${text(data.courseSlug)}/lessons/${data.lessonId}#${commentAnchorId(
    String(data.commentId)
  )}`;
}

const ROWS: Partial<Record<NotificationKind, RowFor>> = {
  "discussion-question": (notification) => ({
    title: `${actorName(notification.actor)} asked a question on ${text(
      notification.data.lessonTitle
    )}`,
    snippet: text(notification.data.snippet),
    category: "discussion",
    href: commentHref(notification.data),
  }),
  "discussion-reply": (notification) => ({
    title: `${actorName(notification.actor)} replied to your question on ${text(
      notification.data.lessonTitle
    )}`,
    snippet: text(notification.data.snippet),
    category: "discussion",
    href: commentHref(notification.data),
  }),
  "refund-request-approved": ({ data }) => ({
    title: "Your Refund Request was approved",
    snippet: `${text(data.courseTitle)} · ${
      quoted(data.decisionNote) ??
      `${formatPrice(Number(data.amount))} on its way back to you`
    }`,
    category: "refund",
    href: "/settings#refund-requests",
  }),
  "refund-request-declined": ({ data }) => ({
    title: "Your Refund Request was declined",
    snippet: [
      text(data.courseTitle),
      quoted(data.decisionNote),
      "You can ask again",
    ]
      .filter(Boolean)
      .join(" · "),
    category: "refund",
    href: "/settings#refund-requests",
  }),
  // From Cadence itself, about the buyer's own request: there's nowhere to go,
  // so clicking only marks it read and the popover stays open.
  "refund-request-confirmation": ({ data }) => ({
    title: "Your Refund Request is under review",
    snippet: `${text(data.courseTitle)} · ${formatPrice(Number(data.amount))}`,
    category: "refund",
    href: null,
  }),
  // A snapshot: it reads the same after another Platform Admin decides it.
  "open-refund-request": ({ data }) => ({
    title: `${text(data.buyerName) || "Someone"} asked for a refund`,
    snippet: [
      text(data.courseTitle),
      formatPrice(Number(data.amount)),
      quoted(data.reason),
    ]
      .filter(Boolean)
      .join(" · "),
    category: "refund",
    href: "/admin/refunds",
  }),
  "new-enrollment": ({ data, actor }) => ({
    title: `${actorName(actor)} enrolled`,
    snippet: text(data.courseTitle),
    category: "enrollment",
    href: `/instructor/${Number(data.courseId)}/students`,
  }),
  "seat-claimed": ({ data, actor }) => ({
    title: `${actorName(actor)} claimed a Seat`,
    snippet: `${text(data.courseTitle)} · ${seatsLeft(Number(data.seatsLeft))}`,
    category: "team",
    href: "/team",
  }),
};

function actorName(actor: FeedNotification["actor"]): string {
  return actor?.name || "A Student";
}

function seatsLeft(count: number): string {
  if (count === 0) return "No Seats left";
  return count === 1 ? "1 Seat left" : `${count} Seats left`;
}

export function describeNotification(notification: FeedNotification): FeedRow {
  const { data } = notification;
  const rowFor = data ? ROWS[data.kind] : undefined;
  if (data && rowFor) return rowFor({ ...notification, data });
  return { title: "New notification", snippet: "", category: null, href: null };
}
