import Knock, { type FeedItem, type FeedMetadata } from "@knocklabs/client";
import { z } from "zod";
import {
  parseNotificationData,
  type FeedCounts,
  type FeedNotification,
  type NotificationFeedPort,
  type NotificationFeedSession,
} from "~/lib/notification-feed";

// ─── Knock feed adapter ───
// The only browser code that imports a Knock SDK (docs/adr/0013). It opens
// one user's feed with that user's signed token and speaks the client feed
// port. One adapter serves one user: switching users means disposing it and
// opening a new one, so a socket or cache can never carry over.

const PAGE_SIZE = 20;

function toCounts(meta: FeedMetadata): FeedCounts {
  return { unseen: meta.unseen_count, unread: meta.unread_count };
}

/** The first actor as Knock returns it; only a named one is shown. */
const actorSchema = z.object({
  name: z.string().min(1),
  avatar: z.string().nullish(),
});

function toFeedNotification(item: FeedItem): FeedNotification {
  const actor = actorSchema.safeParse(item.actors[0]);
  return {
    id: item.id,
    // Unreadable data draws as a plain row rather than breaking the feed.
    data: parseNotificationData(item.data),
    actor: actor.success
      ? { name: actor.data.name, avatarUrl: actor.data.avatar ?? null }
      : null,
    insertedAt: item.inserted_at,
    seen: item.seen_at !== null,
    read: item.read_at !== null,
  };
}

export function knockFeed(
  session: NotificationFeedSession,
  options: {
    /** Called shortly before the user token expires; resolves a fresh one. */
    refreshToken?: () => Promise<string | undefined>;
  } = {}
): NotificationFeedPort {
  const knock = new Knock(session.publicApiKey);
  knock.authenticate({ id: session.userId }, session.userToken, {
    // Cadence syncs user profiles from the server; the browser never does.
    identificationStrategy: "skip",
    onUserTokenExpiring: options.refreshToken
      ? async () => (await options.refreshToken!()) ?? undefined
      : undefined,
  });

  const feed = knock.feeds.initialize(session.feedChannelId, {
    page_size: PAGE_SIZE,
    archived: "exclude",
    status: "all",
  });
  let listening = false;

  function findItem(id: string) {
    return feed.getState().items.find((item) => item.id === id);
  }

  return {
    async listNotifications({ after } = {}) {
      const result = await feed.fetch(after ? { after } : {});
      if (result && result.status !== "ok") {
        throw new Error("Couldn't load the Notification Feed.");
      }
      // Knock skips a fetch while another is in flight; fall back to what
      // its store already holds.
      const page = result?.data ?? {
        entries: feed.getState().items,
        meta: feed.getState().metadata,
        page_info: feed.getState().pageInfo,
      };
      return {
        notifications: page.entries.map(toFeedNotification),
        nextCursor: page.page_info.after ?? null,
        counts: toCounts(page.meta),
      };
    },

    async getCounts() {
      return toCounts(feed.getState().metadata);
    },

    async markRead(notificationId) {
      const item = findItem(notificationId);
      if (item) {
        await feed.markAsRead(item);
      } else {
        await knock.messages.batchUpdateStatuses([notificationId], "read");
      }
    },

    async markAllSeen() {
      // The bulk channel update, so items not loaded yet are seen too.
      await feed.markAllAsSeen();
    },

    async markAllRead() {
      // The bulk channel update, so unloaded items are read too. Never the
      // batch endpoint: `batch/*` with no message ids returns 422.
      await feed.markAllAsRead();
    },

    subscribe(listener) {
      const onReceived = (payload: {
        items: FeedItem[];
        metadata: FeedMetadata;
      }) => {
        listener({
          notifications: payload.items.map(toFeedNotification),
          counts: toCounts(payload.metadata),
        });
      };
      feed.on("items.received.realtime", onReceived);
      if (!listening) {
        feed.listenForUpdates();
        listening = true;
      }
      return () => feed.off("items.received.realtime", onReceived);
    },

    dispose() {
      feed.dispose();
      knock.teardown();
    },
  };
}
