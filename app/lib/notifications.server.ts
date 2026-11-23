import { knockNotifier } from "~/lib/knock-notifier.server";
import type {
  NotificationData,
  NotificationKind,
} from "~/lib/notification-kinds";

// ─── Notifications ───
// The server Notification port: how Cadence sends Notifications, in Cadence's
// own words. Knock is the vendor (docs/adr/0013), but only the Knock adapter
// (knock-notifier.server.ts) knows that. Domain services take a port as a
// parameter, like `db` and `now`, so tests hand in the fake below.
//
// Mirrors the mailer: Knock when KNOCK_SECRET_API_KEY is set, otherwise a
// no-op adapter that only logs, so the app runs without Knock keys.

export type { NotificationKind, NotificationData };

/** What a person can mute. Several Notification kinds can share one. */
export type PreferenceCategory =
  | "refund-request-updates"
  | "open-refund-requests"
  | "seat-claims"
  | "enrollments"
  | "discussion-questions"
  | "discussion-replies";

/** Where a Notification is delivered. v1 only has the Notification Feed. */
export type NotificationChannel = "feed";

export const CATEGORY_OF: Record<NotificationKind, PreferenceCategory> = {
  "refund-request-approved": "refund-request-updates",
  "refund-request-declined": "refund-request-updates",
  "refund-request-confirmation": "refund-request-updates",
  "open-refund-request": "open-refund-requests",
  "seat-claimed": "seat-claims",
  "new-enrollment": "enrollments",
  "discussion-question": "discussion-questions",
  "discussion-reply": "discussion-replies",
};

/** A person a Notification is sent to or comes from. */
export type NotificationUser = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type Notification = {
  kind: NotificationKind;
  recipients: NotificationUser[];
  /** Who caused it. Null for Notifications from Cadence itself. */
  actor: NotificationUser | null;
  data: NotificationData;
  /** One per domain event, so a retry can never send a duplicate. */
  idempotencyKey: string;
};

/** A person's preferences: category × channel → on or off. */
export type NotificationPreferences = Partial<
  Record<PreferenceCategory, Partial<Record<NotificationChannel, boolean>>>
>;

/**
 * What a new person starts with: every category on in the feed except
 * Enrollments, which is opt-in. Knock's environment default can only be set in
 * its dashboard, so Cadence writes these per user when it syncs them.
 */
export const DEFAULT_PREFERENCES = {
  "refund-request-updates": { feed: true },
  "open-refund-requests": { feed: true },
  "seat-claims": { feed: true },
  enrollments: { feed: false },
  "discussion-questions": { feed: true },
  "discussion-replies": { feed: true },
} satisfies Record<PreferenceCategory, Record<NotificationChannel, boolean>>;

export interface NotificationPort {
  trigger(notification: Notification): Promise<void>;
  /** Archive every Notification a comment caused. */
  archiveByComment(commentId: number): Promise<void>;
  /** Send a person's profile, plus default preferences if they have none. */
  syncUser(user: NotificationUser): Promise<void>;
  getPreferences(userId: number): Promise<NotificationPreferences>;
  /** Change one category × channel, leaving every other preference alone. */
  setPreference(
    userId: number,
    category: PreferenceCategory,
    channel: NotificationChannel,
    enabled: boolean
  ): Promise<void>;
}

// ─── Sending safely ───

/**
 * Sends a Notification after the domain write has committed. Building and
 * sending it are both guarded: a failure is logged and swallowed, because a
 * Notification never fails the domain action.
 *
 * Nobody is notified of their own action: the actor is left out of the
 * recipients, and a Notification with nobody left to tell isn't sent.
 */
export async function notifySafely(
  notifier: NotificationPort,
  build: () => Notification
): Promise<void> {
  try {
    const notification = build();
    const actorId = notification.actor?.id;
    const recipients = notification.recipients.filter(
      (recipient) => recipient.id !== actorId
    );
    if (recipients.length === 0) return;
    await notifier.trigger({ ...notification, recipients });
  } catch (error) {
    console.error("[notifications] sending a Notification failed:", error);
  }
}

/**
 * Syncs a person to the Notification vendor after their row is written. Like
 * notifySafely, a failure is logged and swallowed: a sync never fails signup
 * or a profile edit.
 */
export async function syncUserSafely(
  notifier: NotificationPort,
  user: NotificationUser
): Promise<void> {
  try {
    await notifier.syncUser(user);
  } catch (error) {
    console.error(`[notifications] syncing user ${user.id} failed:`, error);
  }
}

// ─── No-op adapter ───

export function loggingNotifier(
  log: (message: string) => void = console.log
): NotificationPort {
  return {
    async trigger(notification) {
      log(
        `[notifications] no Knock key; would send ${notification.kind} to ${notification.recipients
          .map((recipient) => recipient.id)
          .join(", ")} (${notification.idempotencyKey})`
      );
    },
    async archiveByComment(commentId) {
      log(`[notifications] no Knock key; would archive comment ${commentId}`);
    },
    async syncUser(user) {
      log(`[notifications] no Knock key; would sync user ${user.id}`);
    },
    async getPreferences() {
      return {};
    },
    async setPreference(userId, category, channel, enabled) {
      log(
        `[notifications] no Knock key; would set ${category}.${channel}=${enabled} for user ${userId}`
      );
    },
  };
}

// ─── Fake adapter, for tests ───

export type FakeNotifier = NotificationPort & {
  triggers: Notification[];
  archivedComments: number[];
  syncedUsers: NotificationUser[];
  preferences: Map<number, NotificationPreferences>;
};

export function createFakeNotifier(): FakeNotifier {
  const fake: FakeNotifier = {
    triggers: [],
    archivedComments: [],
    syncedUsers: [],
    preferences: new Map(),
    async trigger(notification) {
      fake.triggers.push(notification);
    },
    async archiveByComment(commentId) {
      fake.archivedComments.push(commentId);
    },
    async syncUser(user) {
      fake.syncedUsers.push(user);
      if (!fake.preferences.has(user.id)) {
        fake.preferences.set(user.id, structuredClone(DEFAULT_PREFERENCES));
      }
    },
    async getPreferences(userId) {
      return fake.preferences.get(userId) ?? {};
    },
    async setPreference(userId, category, channel, enabled) {
      // Like the Knock adapter: no preferences yet means start from defaults.
      const current =
        fake.preferences.get(userId) ?? structuredClone(DEFAULT_PREFERENCES);
      fake.preferences.set(userId, {
        ...current,
        [category]: { ...current[category], [channel]: enabled },
      });
    },
  };
  return fake;
}

// ─── Choosing an adapter ───

export function notifierFromEnv(
  env: Record<string, string | undefined> = process.env
): NotificationPort {
  const secretKey = env.KNOCK_SECRET_API_KEY;
  return secretKey ? knockNotifier(secretKey) : loggingNotifier();
}
