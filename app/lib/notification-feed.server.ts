import { signKnockUserToken, knockUserId } from "~/lib/knock-notifier.server";
import type { NotificationFeedSession } from "~/lib/notification-feed";

// ─── Notification Feed session ───
// What the browser needs to read the session user's Notification Feed: the
// vendor's public key, the feed channel and a user token signed for that user
// only. It rides on the app layout's loader data. Without Knock keys, or if
// signing fails, there is no session and the feed shows its empty state:
// Notifications never fail the page.

/** How long a feed token lasts. The client refreshes it before it expires. */
export const FEED_TOKEN_LIFETIME_SECONDS = 60 * 60;

export async function notificationFeedSession(
  cadenceUserId: number,
  env: Record<string, string | undefined> = process.env
): Promise<NotificationFeedSession | null> {
  const publicApiKey = env.KNOCK_PUBLIC_API_KEY;
  const signingKey = env.KNOCK_SIGNING_KEY;
  const feedChannelId = env.KNOCK_FEED_CHANNEL_ID;
  if (!publicApiKey || !signingKey || !feedChannelId) return null;

  try {
    return {
      userId: knockUserId(cadenceUserId),
      userToken: await signKnockUserToken(
        cadenceUserId,
        signingKey,
        FEED_TOKEN_LIFETIME_SECONDS
      ),
      publicApiKey,
      feedChannelId,
    };
  } catch (error) {
    console.error(
      `[notifications] signing a feed token for user ${cadenceUserId} failed:`,
      error
    );
    return null;
  }
}
