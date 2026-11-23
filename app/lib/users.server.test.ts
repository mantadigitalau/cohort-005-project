import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "~/test/setup";
import { users, UserRole } from "~/db/schema";
import {
  createFakeNotifier,
  type FakeNotifier,
  type NotificationPort,
} from "./notifications.server";
import {
  signUp,
  syncAllUsers,
  updateProfile,
  updateUserAsAdmin,
} from "./users.server";

let db: ReturnType<typeof createTestDb>;
let notifier: FakeNotifier;

beforeEach(() => {
  db = createTestDb();
  notifier = createFakeNotifier();
});

function throwingNotifier(): NotificationPort {
  return {
    ...createFakeNotifier(),
    async syncUser() {
      throw new Error("Knock is down");
    },
  };
}

function insertUser(name: string, email: string, avatarUrl: string | null = null) {
  return db
    .insert(users)
    .values({ name, email, role: UserRole.Student, avatarUrl })
    .returning()
    .get();
}

function quietConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("signing up", () => {
  it("syncs the new user to Notifications", async () => {
    const user = await signUp(db, notifier, "Maya Chen", "maya@example.com");

    expect(notifier.syncedUsers).toEqual([
      { id: user.id, name: "Maya Chen", email: "maya@example.com", avatarUrl: null },
    ]);
  });

  it("still creates the account when the sync throws", async () => {
    const error = quietConsoleError();

    const user = await signUp(db, throwingNotifier(), "Maya Chen", "maya@example.com");

    expect(user.name).toBe("Maya Chen");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("changing your profile in /settings", () => {
  it("saves the change and syncs the new name", async () => {
    const maya = insertUser("Maya Chen", "maya@example.com", "https://example.com/maya.png");

    await updateProfile(db, notifier, maya.id, "Maya Lin", "Teaches SQL");

    expect(notifier.syncedUsers).toEqual([
      {
        id: maya.id,
        name: "Maya Lin",
        email: "maya@example.com",
        avatarUrl: "https://example.com/maya.png",
      },
    ]);
  });

  it("still saves the change when the sync throws", async () => {
    const error = quietConsoleError();
    const maya = insertUser("Maya Chen", "maya@example.com");

    const updated = await updateProfile(db, throwingNotifier(), maya.id, "Maya Lin", null);

    expect(updated.name).toBe("Maya Lin");
    error.mockRestore();
  });
});

describe("a Platform Admin editing a user", () => {
  it("saves the change and syncs the new name and email", async () => {
    const maya = insertUser("Maya Chen", "maya@example.com");

    await updateUserAsAdmin(db, notifier, maya.id, "Maya Lin", "lin@example.com");

    expect(notifier.syncedUsers).toEqual([
      { id: maya.id, name: "Maya Lin", email: "lin@example.com", avatarUrl: null },
    ]);
  });

  it("still saves the change when the sync throws", async () => {
    const error = quietConsoleError();
    const maya = insertUser("Maya Chen", "maya@example.com");

    await updateUserAsAdmin(db, throwingNotifier(), maya.id, "Maya Lin", "lin@example.com");

    const saved = db.select().from(users).where(eq(users.id, maya.id)).get();
    expect(saved?.email).toBe("lin@example.com");
    error.mockRestore();
  });
});

describe("syncing every user (seed and backfill)", () => {
  it("syncs each user and gives them the default preferences", async () => {
    const maya = insertUser("Maya Chen", "maya@example.com");
    const liam = insertUser("Liam Ortiz", "liam@example.com");

    const result = await syncAllUsers(db, notifier);

    expect(notifier.syncedUsers.map((user) => user.id)).toEqual([maya.id, liam.id]);
    expect(notifier.preferences.get(liam.id)?.enrollments).toEqual({ feed: false });
    expect(result).toEqual({ synced: 2, failed: 0 });
  });

  it("keeps going past a user whose sync fails, and counts it", async () => {
    const error = quietConsoleError();
    insertUser("Maya Chen", "maya@example.com");
    const liam = insertUser("Liam Ortiz", "liam@example.com");
    const flaky: NotificationPort = {
      ...notifier,
      async syncUser(user) {
        if (user.id !== liam.id) throw new Error("Knock is down");
        await notifier.syncUser(user);
      },
    };

    const result = await syncAllUsers(db, flaky);

    expect(notifier.syncedUsers.map((user) => user.id)).toEqual([liam.id]);
    expect(result).toEqual({ synced: 1, failed: 1 });
    error.mockRestore();
  });
});
