// ─── Notification kinds ───
// Shared by the server (which sends Notifications) and the browser (which
// draws them in the Notification Feed), so this module stays free of server
// code.

/** Every Notification in the catalogue. */
export type NotificationKind =
  | "refund-request-approved"
  | "refund-request-declined"
  | "refund-request-confirmation"
  | "open-refund-request"
  | "seat-claimed"
  | "new-enrollment"
  | "discussion-question"
  | "discussion-reply";

/**
 * Everything the Notification Feed needs to draw a row. Kept flat and scalar
 * so the vendor can filter on it (e.g. archiving by comment id).
 */
export type NotificationData = { kind: NotificationKind } & Record<
  string,
  string | number | boolean | null
>;
