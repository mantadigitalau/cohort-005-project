import { asc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";
import {
  syncUserSafely,
  type NotificationPort,
  type NotificationUser,
} from "~/lib/notifications.server";

// ─── Users ───
// Writing a user's profile. Every write that changes what a Notification shows
// about a person (name, email, avatar) syncs them to the Notification vendor
// afterwards, so older Notifications pick up the change. A failed sync is
// logged and never fails the write.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;
type User = typeof users.$inferSelect;

function toNotificationUser(user: User): NotificationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/** Creates a Student account. */
export async function signUp(
  db: Db,
  notifier: NotificationPort,
  name: string,
  email: string
): Promise<User> {
  const user = db
    .insert(users)
    .values({ name, email, role: UserRole.Student, avatarUrl: null })
    .returning()
    .get();
  await syncUserSafely(notifier, toNotificationUser(user));
  return user;
}

/** A person changing their own name or bio in /settings. */
export async function updateProfile(
  db: Db,
  notifier: NotificationPort,
  userId: number,
  name: string,
  bio: string | null
): Promise<User> {
  const user = db
    .update(users)
    .set({ name, bio })
    .where(eq(users.id, userId))
    .returning()
    .get();
  await syncUserSafely(notifier, toNotificationUser(user));
  return user;
}

/** A Platform Admin changing someone's name or email on the user admin page. */
export async function updateUserAsAdmin(
  db: Db,
  notifier: NotificationPort,
  userId: number,
  name: string,
  email: string
): Promise<User> {
  const user = db
    .update(users)
    .set({ name, email })
    .where(eq(users.id, userId))
    .returning()
    .get();
  await syncUserSafely(notifier, toNotificationUser(user));
  return user;
}

/**
 * Syncs every user, one at a time, for the seed and the one-off backfill. A
 * user whose sync fails is logged and counted, and the rest still sync.
 */
export async function syncAllUsers(
  db: Db,
  notifier: NotificationPort
): Promise<{ synced: number; failed: number }> {
  const all = db.select().from(users).orderBy(asc(users.id)).all();
  let synced = 0;
  let failed = 0;
  for (const user of all) {
    try {
      await notifier.syncUser(toNotificationUser(user));
      synced++;
    } catch (error) {
      failed++;
      console.error(`[notifications] syncing user ${user.id} failed:`, error);
    }
  }
  return { synced, failed };
}
