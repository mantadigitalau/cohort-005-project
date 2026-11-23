import Knock, { signUserToken } from "@knocklabs/node";
import type {
  NotificationKind,
  NotificationPort,
  NotificationUser,
  PreferenceCategory,
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

function notYet(method: string): never {
  throw new Error(`Knock adapter: ${method} is not implemented yet.`);
}

export function knockNotifier(secretApiKey: string): NotificationPort {
  const knock = new Knock({ apiKey: secretApiKey });

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
    async syncUser() {
      notYet("syncUser");
    },
    async getPreferences() {
      return notYet("getPreferences");
    },
    async setPreference() {
      notYet("setPreference");
    },
  };
}
