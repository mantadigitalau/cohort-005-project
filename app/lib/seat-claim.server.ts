import { and, eq, isNull } from "drizzle-orm";
import { coupons, courses, enrollments, purchases } from "~/db/schema";
import {
  enrollUser,
  getNotificationUser,
  isEnrolled,
  notifyNewEnrollment,
} from "~/lib/enrollment.server";
import {
  notifySafely,
  type Notification,
  type NotificationPort,
} from "~/lib/notifications.server";
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

/**
 * Claims the Seat with this code for a Student and enrolls them. The Team
 * Admin who bought the Team Licence hears the Seat was claimed, and the
 * course's Instructor gets a New Enrollment Notification.
 */
export async function claimSeat(
  db: Db,
  code: string,
  userId: number,
  userCountry: string,
  now: Date,
  notifier: NotificationPort
): Promise<ClaimSeatResult> {
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

  await notifySafely(notifier, () => seatClaimedNotification(db, seat, userId));
  await notifyNewEnrollment(db, enrollment, notifier);

  return { ok: true, enrollment };
}

/**
 * To the Team Admin who bought the Team Licence: who claimed the Seat, for
 * which course, and how many of that Team Licence's Seats can still be claimed.
 */
function seatClaimedNotification(
  db: Db,
  seat: typeof coupons.$inferSelect,
  claimantId: number
): Notification {
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (!purchase) throw new Error(`Purchase ${seat.purchaseId} not found.`);

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  if (!course) throw new Error(`Course ${seat.courseId} not found.`);

  const seatsLeft = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.purchaseId, seat.purchaseId),
        isNull(coupons.redeemedAt),
        isNull(coupons.refundedAt)
      )
    )
    .all().length;

  return {
    kind: "seat-claimed",
    recipients: [getNotificationUser(db, purchase.userId)],
    actor: getNotificationUser(db, claimantId),
    data: {
      kind: "seat-claimed",
      courseId: course.id,
      courseTitle: course.title,
      courseSlug: course.slug,
      seatId: seat.id,
      seatsLeft,
    },
    idempotencyKey: `seat-claimed:${seat.id}`,
  };
}
