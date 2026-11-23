import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  buyIndividualPurchase,
  buyTeamLicence,
  isEnrolled,
} from "./enrollment.server";
import { createFakeNotifier, type FakeNotifier } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let notifier: FakeNotifier;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifier = createFakeNotifier();
});

describe("buyIndividualPurchase", () => {
  it("records the Purchase and enrolls the buyer", async () => {
    const result = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      "NL",
      NOW,
      notifier
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.purchase).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 7900,
      country: "NL",
    });
    expect(result.enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      enrolledAt: NOW.toISOString(),
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
  });

  it("enrolls a Lapsed Student again", async () => {
    const first = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );
    if (!first.ok) throw new Error("first purchase failed");
    // The Student loses their Enrollment (e.g. a refund) but keeps progress.
    db.delete(schema.enrollments)
      .where(eq(schema.enrollments.id, first.enrollment.id))
      .run();
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);

    const again = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );

    expect(again.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
  });

  it("refuses a buyer who is already enrolled", async () => {
    await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );

    const result = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );

    expect(result).toEqual({ ok: false, reason: "already_enrolled" });
    const buyerPurchases = db
      .select()
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.userId, base.user.id),
          eq(schema.purchases.courseId, base.course.id)
        )
      )
      .all();
    expect(buyerPurchases).toHaveLength(1);
  });
});

describe("the New Enrollment Notification", () => {
  it("tells the Instructor when a Student makes an Individual Purchase", async () => {
    const result = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );
    if (!result.ok) throw new Error("purchase failed");

    expect(notifier.triggers).toEqual([
      {
        kind: "new-enrollment",
        recipients: [expect.objectContaining({ id: base.instructor.id })],
        actor: expect.objectContaining({
          id: base.user.id,
          name: base.user.name,
        }),
        data: {
          kind: "new-enrollment",
          courseId: base.course.id,
          courseTitle: base.course.title,
          courseSlug: base.course.slug,
          enrollmentId: result.enrollment.id,
        },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("tells the Instructor again when a Lapsed Student enrolls again", async () => {
    const first = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );
    if (!first.ok) throw new Error("first purchase failed");
    db.delete(schema.enrollments)
      .where(eq(schema.enrollments.id, first.enrollment.id))
      .run();

    const again = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );
    if (!again.ok) throw new Error("second purchase failed");

    expect(notifier.triggers.map((n) => n.idempotencyKey)).toEqual([
      `enrollment:${first.enrollment.id}`,
      `enrollment:${again.enrollment.id}`,
    ]);
    expect(notifier.triggers[1].recipients).toEqual([
      expect.objectContaining({ id: base.instructor.id }),
    ]);
  });

  it("isn't sent when the buyer is already enrolled", async () => {
    await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );
    await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      notifier
    );

    expect(notifier.triggers).toHaveLength(1);
  });

  it("never fails the purchase when sending throws", async () => {
    const throwing = createFakeNotifier();
    throwing.trigger = async () => {
      throw new Error("Knock is down");
    };
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW,
      throwing
    );

    expect(result.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});

describe("buyTeamLicence", () => {
  it("grants Seats but doesn't enroll the buyer", () => {
    const result = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      3 * 7900,
      "NL",
      3,
      NOW
    );

    expect(result.purchase).toMatchObject({
      userId: base.user.id,
      amountPaid: 3 * 7900,
    });
    expect(result.seats).toHaveLength(3);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("reuses the buyer's team for a second Team Licence", () => {
    const first = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      1,
      NOW
    );
    const second = buyTeamLicence(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      1,
      NOW
    );

    expect(second.team.id).toBe(first.team.id);
  });
});
