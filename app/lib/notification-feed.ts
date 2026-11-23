import type { NotificationData, NotificationKind } from "~/lib/notification-kinds";
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
  data: NotificationData;
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

type RowFor = (notification: FeedNotification) => FeedRow;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function quoted(value: unknown): string | null {
  const note = text(value).trim();
  return note ? `“${note}”` : null;
}

const ROWS: Partial<Record<NotificationKind, RowFor>> = {
  "refund-request-approved": ({ data }) => ({
    title: "Your Refund Request was approved",
    snippet: `${text(data.courseTitle)} · ${
      quoted(data.decisionNote) ??
      `${formatPrice(Number(data.amount))} on its way back to you`
    }`,
    category: "refund",
    href: "/settings#refund-requests",
  }),
};

export function describeNotification(notification: FeedNotification): FeedRow {
  const rowFor = ROWS[notification.data.kind];
  if (rowFor) return rowFor(notification);
  return { title: "New notification", snippet: "", category: null, href: null };
}
