// ─── Client feed port ───
// How the browser reads the session user's Notification Feed, in Cadence's
// own words. Feed components only ever call this port. Its Knock adapter is
// knock-feed.client.ts (docs/adr/0013).

/** What the server hands the browser so it can open the user's feed. */
export type NotificationFeedSession = {
  /** The vendor's id for the session user. */
  userId: string;
  /** Signed for this user only: it can't read another user's feed. */
  userToken: string;
  publicApiKey: string;
  feedChannelId: string;
};
