import { eq } from "drizzle-orm";
import { coupons, enrollments, purchases } from "~/db/schema";
import { enrollUser, isEnrolled } from "~/lib/enrollment.server";
import { getSeatAvailability, type Db } from "~/lib/refunds.server";

// ─── Seat claim ───
// A Student claiming a Seat on a Team Licence, which gives them an Enrollment.
// See GLOSSARY.md for the language.
//
// Takes the database first and the current time last, so tests can hand in an
// in-memory database and a fixed clock. Uses positional parameters (project
// convention).

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

export function getSeatByCode(db: Db, code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

/**
 * Whether claiming from this country breaks the rule that a Seat is claimed
 * from the same country as its Team Licence was bought in.
 */
export function isCountryMismatch(
  db: Db,
  seat: typeof coupons.$inferSelect,
  claimantCountry: string
): boolean {
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  return !!purchase?.country && purchase.country !== claimantCountry;
}

/** Claims the Seat with this code for a Student and enrolls them. */
export function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): ClaimSeatResult {
  const seat = getSeatByCode(db, code);
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  if (seat.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  if (isEnrolled(db, userId, seat.courseId)) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  if (isCountryMismatch(db, seat, userCountry)) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({ redeemedByUserId: userId, redeemedAt: now.toISOString() })
    .where(eq(coupons.id, seat.id))
    .run();

  const enrollment = enrollUser(db, userId, seat.courseId, now);

  return { ok: true, enrollment };
}
