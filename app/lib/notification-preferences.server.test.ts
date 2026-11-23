import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import { courses, users, UserRole } from "~/db/schema";
import { buyIndividualPurchase, buyTeamLicence } from "./enrollment.server";
import { createFakeNotifier, type FakeNotifier } from "./notifications.server";
import { getPreferenceSwitches } from "./notification-preferences.server";

const NOW = new Date(2026, 10, 23, 12, 0, 0);

function insertUser(name: string, email: string, role: UserRole) {
  return db.insert(users).values({ name, email, role }).returning().get();
}

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let notifier: FakeNotifier;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifier = createFakeNotifier();
});

async function visibleCategories(userId: number) {
  const switches = await getPreferenceSwitches(db, notifier, userId);
  return switches.map((preferenceSwitch) => preferenceSwitch.category);
}

describe("which Notification switches a person sees", () => {
  it("shows a Student with nothing only Discussion Replies", async () => {
    expect(await visibleCategories(base.user.id)).toEqual([
      "discussion-replies",
    ]);
  });

  it("shows Refund Request updates once the person has a Purchase", async () => {
    await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      4900,
      "NL",
      NOW,
      notifier
    );

    expect(await visibleCategories(base.user.id)).toEqual([
      "refund-request-updates",
      "discussion-replies",
    ]);
  });

  it("shows Seat claims to a Team Admin on a Team Licence", async () => {
    buyTeamLicence(db, base.user.id, base.course.id, 7900, "NL", 2, NOW);

    expect(await visibleCategories(base.user.id)).toEqual([
      "refund-request-updates",
      "seat-claims",
      "discussion-replies",
    ]);
  });

  it("shows an Instructor Enrollments and Discussion Questions", async () => {
    expect(await visibleCategories(base.instructor.id)).toEqual([
      "enrollments",
      "discussion-questions",
      "discussion-replies",
    ]);
  });

  it("treats anyone who teaches a course as an Instructor, whatever their role", async () => {
    const admin = insertUser("Ada Admin", "ada@example.com", UserRole.Admin);
    db.update(courses)
      .set({ instructorId: admin.id })
      .where(eq(courses.id, base.course.id))
      .run();

    expect(await visibleCategories(admin.id)).toEqual([
      "open-refund-requests",
      "enrollments",
      "discussion-questions",
      "discussion-replies",
    ]);
  });

  it("shows a Platform Admin Open Refund Requests", async () => {
    const admin = insertUser("Ada Admin", "ada@example.com", UserRole.Admin);

    expect(await visibleCategories(admin.id)).toEqual([
      "open-refund-requests",
      "discussion-replies",
    ]);
  });
});

describe("a switch's value", () => {
  it("is the default when the person has never chosen: Enrollments off, the rest on", async () => {
    const switches = await getPreferenceSwitches(db, notifier, base.instructor.id);

    expect(switches).toEqual([
      { category: "enrollments", enabled: false },
      { category: "discussion-questions", enabled: true },
      { category: "discussion-replies", enabled: true },
    ]);
  });

  it("is the person's saved choice when they have made one", async () => {
    await notifier.setPreference(base.instructor.id, "enrollments", "feed", true);
    await notifier.setPreference(base.instructor.id, "discussion-replies", "feed", false);

    const switches = await getPreferenceSwitches(db, notifier, base.instructor.id);

    expect(switches).toEqual([
      { category: "enrollments", enabled: true },
      { category: "discussion-questions", enabled: true },
      { category: "discussion-replies", enabled: false },
    ]);
  });

  it("keeps a hidden choice, so it is already set when the person qualifies", async () => {
    await notifier.setPreference(base.user.id, "refund-request-updates", "feed", false);
    expect(await visibleCategories(base.user.id)).toEqual(["discussion-replies"]);

    await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      4900,
      "NL",
      NOW,
      notifier
    );

    expect(await getPreferenceSwitches(db, notifier, base.user.id)).toEqual([
      { category: "refund-request-updates", enabled: false },
      { category: "discussion-replies", enabled: true },
    ]);
  });
});
