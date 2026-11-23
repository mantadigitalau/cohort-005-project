// PROTOTYPE — Notification Feed (wayfinder ticket #20). Throwaway; lives on
// the `prototype/notification-feed` branch only.
import { Knock, signUserToken } from "@knocklabs/node";

// The dev server doesn't load .env into process.env, so do it here.
try {
  process.loadEnvFile(".env");
} catch {}

export const PROTOTYPE_WORKFLOW_KEY = "prototype-notification";

export function knockUserId(userId: number) {
  return String(userId);
}

export function getKnockClient() {
  return new Knock({ apiKey: process.env.KNOCK_SECRET_API_KEY });
}

export interface FeedAuth {
  knockUserId: string;
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
}

/** Everything the browser needs to read the user's feed straight from Knock. */
export async function getFeedAuth(userId: number): Promise<FeedAuth | null> {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  const signingKey = process.env.KNOCK_SIGNING_KEY;
  if (!publicApiKey || !feedChannelId || !signingKey) return null;

  const id = knockUserId(userId);
  const userToken = await signUserToken(id, {
    signingKey,
    expiresInSeconds: 60 * 60,
  });
  return { knockUserId: id, userToken, publicApiKey, feedChannelId };
}
