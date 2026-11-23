import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { users } from "~/db/schema";
import type { NotificationUser } from "~/lib/notifications.server";

// ─── Notification users ───
// Turning a Cadence user into the NotificationUser the Notification port
// takes. Every domain service that sends a Notification or syncs a person
// goes through here, so the shape lives in one place.

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type User = typeof users.$inferSelect;

export function toNotificationUser(user: User): NotificationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/** Loads a user as a NotificationUser. Throws if they don't exist. */
export function loadNotificationUser(
  db: Db | Tx,
  userId: number
): NotificationUser {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`User ${userId} not found.`);
  return toNotificationUser(user);
}
