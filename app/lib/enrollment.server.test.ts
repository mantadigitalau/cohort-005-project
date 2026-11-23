import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  buyIndividualPurchase,
  buyTeamLicence,
  isEnrolled,
} from "./enrollment.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("buyIndividualPurchase", () => {
  it("records the Purchase and enrolls the buyer", () => {
    const result = buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      "NL",
      NOW
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

  it("enrolls a Lapsed Student again", () => {
    const first = buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW
    );
    if (!first.ok) throw new Error("first purchase failed");
    // The Student loses their Enrollment (e.g. a refund) but keeps progress.
    db.delete(schema.enrollments)
      .where(eq(schema.enrollments.id, first.enrollment.id))
      .run();
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);

    const again = buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW
    );

    expect(again.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
  });

  it("refuses a buyer who is already enrolled", () => {
    buyIndividualPurchase(db, base.user.id, base.course.id, 7900, null, NOW);

    const result = buyIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      null,
      NOW
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
