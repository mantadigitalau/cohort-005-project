import Knock, { NotFoundError, signUserToken } from "@knocklabs/node";
import { z } from "zod";
import {
  CATEGORY_OF,
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

/**
 * An RS256 user token for Knock's enhanced security: it lets the browser read
 * this one user's Notification Feed, and no one else's. The signing key is
 * PEM or base64-encoded PEM, as Knock's dashboard hands it out.
 */
export function signKnockUserToken(
  cadenceUserId: number,
  signingKey: string,
  expiresInSeconds: number
): Promise<string> {
  return signUserToken(knockUserId(cadenceUserId), {
    signingKey,
    expiresInSeconds,
  });
}

function toKnockUser(user: NotificationUser) {
  return {
    id: knockUserId(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

/**
 * Every category, typed, so no key below needs a cast. A function, not a
 * constant: notifications.server imports this module, so CATEGORY_OF isn't
 * initialised yet while this module loads.
 */
function allCategories(): PreferenceCategory[] {
  return [...new Set(Object.values(CATEGORY_OF))];
}

const CHANNELS: NotificationChannel[] = ["feed"];

function toKnockPreferences(preferences: NotificationPreferences) {
  const categories: Record<
    string,
    { channel_types: Record<string, boolean> }
  > = {};
  for (const category of allCategories()) {
    const channels = preferences[category];
    if (!channels) continue;
    const channelTypes: Record<string, boolean> = {};
    for (const channel of CHANNELS) {
      const enabled = channels[channel];
      if (enabled !== undefined) {
        channelTypes[KNOCK_CHANNEL_TYPES[channel]] = enabled;
      }
    }
    categories[KNOCK_CATEGORY_KEYS[category]] = {
      channel_types: channelTypes,
    };
  }
  return { categories };
}

function categoryOfKnockKey(key: string): PreferenceCategory | undefined {
  return allCategories().find(
    (category) => KNOCK_CATEGORY_KEYS[category] === key
  );
}

const CHANNEL_OF_KNOCK_TYPE = new Map(
  CHANNELS.map((channel) => [KNOCK_CHANNEL_TYPES[channel], channel])
);

type KnockPreferenceSet = Awaited<ReturnType<Knock["users"]["getPreferences"]>>;
type KnockCategorySetting = NonNullable<
  KnockPreferenceSet["categories"]
>[string];

/**
 * One category's setting as Knock returns it: a whole-category boolean, or
 * per-channel-type values. Channel-type values other than plain booleans
 * (e.g. conditions) are skipped, as Cadence never writes them.
 */
const knockCategorySettingSchema = z.union([
  z.boolean(),
  z.object({
    channel_types: z.record(z.string(), z.unknown()).nullish(),
  }),
]);

const knockPreferenceSetSchema = z.object({
  categories: z.record(z.string(), z.unknown()).nullish(),
});

/**
 * Reads Cadence's categories out of a Knock set, parsing what Knock returned
 * rather than trusting it. A whole-category boolean applies to every channel;
 * keys Cadence doesn't know, and settings it can't read, are ignored.
 */
function fromKnockPreferences(set: unknown): NotificationPreferences {
  const preferences: NotificationPreferences = {};
  const parsedSet = knockPreferenceSetSchema.safeParse(set);
  if (!parsedSet.success) return preferences;

  for (const [key, raw] of Object.entries(parsedSet.data.categories ?? {})) {
    const category = categoryOfKnockKey(key);
    const setting = knockCategorySettingSchema.safeParse(raw);
    if (!category || !setting.success) continue;
    if (typeof setting.data === "boolean") {
      preferences[category] = { feed: setting.data };
      continue;
    }
    const channels: Partial<Record<NotificationChannel, boolean>> = {};
    for (const [type, enabled] of Object.entries(
      setting.data.channel_types ?? {}
    )) {
      const channel = CHANNEL_OF_KNOCK_TYPE.get(type);
      if (channel && typeof enabled === "boolean") channels[channel] = enabled;
    }
    preferences[category] = channels;
  }
  return preferences;
}

/** Turns one category's setting on or off for one channel, keeping the rest. */
function withChannel(
  setting: KnockCategorySetting | undefined,
  channelType: string,
  enabled: boolean
): KnockCategorySetting {
  if (setting === undefined || typeof setting === "boolean") {
    return { channel_types: { [channelType]: enabled } };
  }
  return {
    ...setting,
    channel_types: { ...setting.channel_types, [channelType]: enabled },
  };
}

/** The parts of the Knock SDK Cadence uses; tests hand in a stand-in. */
export type KnockClient = {
  workflows: Pick<Knock["workflows"], "trigger">;
  users: Pick<Knock["users"], "update" | "getPreferences" | "setPreferences">;
  messages: Pick<Knock["messages"], "list"> & {
    batch: Pick<Knock["messages"]["batch"], "archive">;
  };
};

export function knockNotifier(
  secretApiKeyOrClient: string | KnockClient
): NotificationPort {
  const knock: KnockClient =
    typeof secretApiKeyOrClient === "string"
      ? new Knock({ apiKey: secretApiKeyOrClient })
      : secretApiKeyOrClient;

  /** A user's preference set, or null if Knock has none (404). */
  async function readSet(knockId: string): Promise<KnockPreferenceSet | null> {
    try {
      return await knock.users.getPreferences(knockId, PREFERENCE_SET);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  /** A missing set and an empty one both mean "never had any". */
  async function hasPreferences(knockId: string): Promise<boolean> {
    const set = await readSet(knockId);
    return Object.keys(set?.categories ?? {}).length > 0;
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
    async archiveByComment(commentId) {
      // Every Notification a comment causes carries its id in `data`, so
      // Knock's trigger_data filter finds them. Iterating walks every page.
      const messageIds: string[] = [];
      for await (const message of knock.messages.list({
        trigger_data: JSON.stringify({ commentId }),
      })) {
        messageIds.push(message.id);
      }
      // Knock answers a batch with no message ids with a 422.
      if (messageIds.length === 0) return;
      await knock.messages.batch.archive({ message_ids: messageIds });
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
    async getPreferences(userId) {
      const set = await readSet(knockUserId(userId));
      return set ? fromKnockPreferences(set) : {};
    },
    async setPreference(userId, category, channel, enabled) {
      // Knock's setPreferences replaces the whole set, so read the current
      // one and write it back with only this category × channel changed. A
      // person with no set yet starts from Cadence's defaults, so changing
      // one switch never leaves the others (e.g. Enrollments) unset.
      const id = knockUserId(userId);
      const set = await readSet(id);
      const key = KNOCK_CATEGORY_KEYS[category];
      const categories: Record<string, KnockCategorySetting> =
        Object.keys(set?.categories ?? {}).length > 0
          ? { ...set?.categories }
          : toKnockPreferences(DEFAULT_PREFERENCES).categories;
      categories[key] = withChannel(
        categories[key],
        KNOCK_CHANNEL_TYPES[channel],
        enabled
      );
      await knock.users.setPreferences(id, PREFERENCE_SET, {
        ...(set?.channel_types && { channel_types: set.channel_types }),
        ...(set?.workflows && { workflows: set.workflows }),
        categories,
      });
    },
  };
}
