import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { buyTeamLicence, isEnrolled } from "./enrollment.server";
import { claimSeat } from "./seat-claim.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = db
    .insert(schema.users)
    .values({
      name: "Tess Admin",
      email: "tess@example.com",
      role: UserRole.Student,
    })
    .returning()
    .get();
});

function buySeat(country: string | null = "NL") {
  const { seats } = buyTeamLicence(
    db,
    teamAdmin.id,
    base.course.id,
    7900,
    country,
    1,
    NOW
  );
  return seats[0];
}

describe("claimSeat", () => {
  it("enrolls the claimant and marks the Seat claimed", () => {
    const seat = buySeat();

    const result = claimSeat(db, seat.code, base.user.id, "NL", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    const claimed = db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.id, seat.id))
      .get();
    expect(claimed).toMatchObject({
      redeemedByUserId: base.user.id,
      redeemedAt: NOW.toISOString(),
    });
  });

  it("refuses an unknown code", () => {
    expect(claimSeat(db, "nope", base.user.id, "NL", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });

  it("refuses a Seat that is already claimed", () => {
    const seat = buySeat();
    claimSeat(db, seat.code, base.user.id, "NL", NOW);

    const result = claimSeat(db, seat.code, base.instructor.id, "NL", NOW);

    expect(result).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses a claimant who is already enrolled", () => {
    const first = buySeat();
    const second = buySeat();
    claimSeat(db, first.code, base.user.id, "NL", NOW);

    const result = claimSeat(db, second.code, base.user.id, "NL", NOW);

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("refuses a claimant in a different country from the buyer", () => {
    const seat = buySeat("NL");

    const result = claimSeat(db, seat.code, base.user.id, "AU", NOW);

    expect(result.ok).toBe(false);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", () => {
    const seat = buySeat();
    db.insert(schema.refunds)
      .values({
        purchaseId: seat.purchaseId,
        reason: "Changed plans",
        status: RefundStatus.Open,
      })
      .run();

    const result = claimSeat(db, seat.code, base.user.id, "NL", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });
});
