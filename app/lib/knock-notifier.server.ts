import Knock, { NotFoundError } from "@knocklabs/node";
import {
  DEFAULT_PREFERENCES,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPort,
  type NotificationPreferences,
  type NotificationUser,
  type PreferenceCategory,
} from "~/lib/notifications.server";

// ─── Knock adapter ───
// The only code in Cadence that imports a Knock SDK (docs/adr/0013). It maps
// Cadence's names to Knock's keys. Every workflow below must exist and be
// committed in Knock (scripts/knock-workflows-wizard.sh), or triggering it
// returns 404.

export const KNOCK_WORKFLOW_KEYS: Record<NotificationKind, string> = {
  "refund-request-approved": "refund-request-approved",
  "refund-request-declined": "refund-request-declined",
  "refund-request-confirmation": "refund-request-confirmation",
  "open-refund-request": "open-refund-request",
  "seat-claimed": "seat-claimed",
  "new-enrollment": "new-enrollment",
  "discussion-question": "discussion-question",
  "discussion-reply": "discussion-reply",
};

export const KNOCK_CATEGORY_KEYS: Record<PreferenceCategory, string> = {
  "refund-request-updates": "refund-request-updates",
  "open-refund-requests": "open-refund-requests",
  "seat-claims": "seat-claims",
  enrollments: "enrollments",
  "discussion-questions": "discussion-questions",
  "discussion-replies": "discussion-replies",
};

export const KNOCK_CHANNEL_TYPES: Record<NotificationChannel, string> = {
  feed: "in_app_feed",
};

/** Every user has one preference set in Knock: the "default" one. */
const PREFERENCE_SET = "default";

export function knockUserId(cadenceUserId: number): string {
  return String(cadenceUserId);
}

function toKnockUser(user: NotificationUser) {
  return {
    id: knockUserId(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

function toKnockPreferences(preferences: NotificationPreferences) {
  const categories: Record<
    string,
    { channel_types: Record<string, boolean> }
  > = {};
  for (const [category, channels] of Object.entries(preferences)) {
    const channelTypes: Record<string, boolean> = {};
    for (const [channel, enabled] of Object.entries(channels ?? {})) {
      channelTypes[KNOCK_CHANNEL_TYPES[channel as NotificationChannel]] =
        enabled;
    }
    categories[KNOCK_CATEGORY_KEYS[category as PreferenceCategory]] = {
      channel_types: channelTypes,
    };
  }
  return { categories };
}

function notYet(method: string): never {
  throw new Error(`Knock adapter: ${method} is not implemented yet.`);
}

/** The parts of the Knock SDK Cadence uses; tests hand in a stand-in. */
export type KnockClient = {
  workflows: Pick<Knock["workflows"], "trigger">;
  users: Pick<Knock["users"], "update" | "getPreferences" | "setPreferences">;
};

export function knockNotifier(
  secretApiKeyOrClient: string | KnockClient
): NotificationPort {
  const knock: KnockClient =
    typeof secretApiKeyOrClient === "string"
      ? new Knock({ apiKey: secretApiKeyOrClient })
      : secretApiKeyOrClient;

  /** A missing set (404) and an empty one both mean "never had any". */
  async function hasPreferences(knockId: string): Promise<boolean> {
    try {
      const set = await knock.users.getPreferences(knockId, PREFERENCE_SET);
      return Object.keys(set.categories ?? {}).length > 0;
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
  }

  return {
    async trigger(notification) {
      await knock.workflows.trigger(
        KNOCK_WORKFLOW_KEYS[notification.kind],
        {
          recipients: notification.recipients.map(toKnockUser),
          actor: notification.actor ? toKnockUser(notification.actor) : null,
          data: notification.data,
        },
        { idempotencyKey: notification.idempotencyKey }
      );
    },
    async archiveByComment() {
      notYet("archiveByComment");
    },
    async syncUser(user) {
      const { id, ...profile } = toKnockUser(user);
      await knock.users.update(id, profile);

      // Cadence owns the defaults, and never overwrites a choice once made.
      if (!(await hasPreferences(id))) {
        await knock.users.setPreferences(
          id,
          PREFERENCE_SET,
          toKnockPreferences(DEFAULT_PREFERENCES)
        );
      }
    },
    async getPreferences() {
      return notYet("getPreferences");
    },
    async setPreference() {
      notYet("setPreference");
    },
  };
}
