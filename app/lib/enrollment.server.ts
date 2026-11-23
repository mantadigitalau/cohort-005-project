import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  teamMembers,
  teams,
  TeamMemberRole,
} from "~/db/schema";
import type { Db } from "~/lib/refunds.server";

// ─── Enrollment ───
// Giving a Student an Enrollment, and the Purchases that lead to one (or, for a
// Team Licence, to Seats instead). See GLOSSARY.md for the language.
//
// Every function takes the database first and the current time last, so tests
// can hand in an in-memory database and a fixed clock. Uses positional
// parameters (project convention).

type Enrollment = typeof enrollments.$inferSelect;
type Purchase = typeof purchases.$inferSelect;
type Team = typeof teams.$inferSelect;
type Seat = typeof coupons.$inferSelect;

export function findEnrollment(
  db: Db,
  userId: number,
  courseId: number
): Enrollment | undefined {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

export function isEnrolled(db: Db, userId: number, courseId: number): boolean {
  return !!findEnrollment(db, userId, courseId);
}

/**
 * Gives a Student an Enrollment on a course. A Lapsed Student, who lost their
 * Enrollment, gets a new one. Throws if they're already enrolled or the course
 * doesn't exist.
 */
export function enrollUser(
  db: Db,
  userId: number,
  courseId: number,
  now: Date
): Enrollment {
  if (isEnrolled(db, userId, courseId)) {
    throw new Error("User is already enrolled in this course");
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    throw new Error("Course not found");
  }

  return db
    .insert(enrollments)
    .values({ userId, courseId, enrolledAt: now.toISOString() })
    .returning()
    .get();
}

function createPurchase(
  db: Db,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date
): Purchase {
  return db
    .insert(purchases)
    .values({
      userId,
      courseId,
      amountPaid,
      country,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
}

export type IndividualPurchaseResult =
  | { ok: true; purchase: Purchase; enrollment: Enrollment }
  | { ok: false; reason: "already_enrolled" };

/** An Individual Purchase: the buyer pays and gets an Enrollment. */
export function buyIndividualPurchase(
  db: Db,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date
): IndividualPurchaseResult {
  if (isEnrolled(db, userId, courseId)) {
    return { ok: false, reason: "already_enrolled" };
  }

  const purchase = createPurchase(
    db,
    userId,
    courseId,
    amountPaid,
    country,
    now
  );
  const enrollment = enrollUser(db, userId, courseId, now);
  return { ok: true, purchase, enrollment };
}

function getTeamForAdmin(db: Db, userId: number): Team | undefined {
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

function getOrCreateTeamForUser(db: Db, userId: number): Team {
  const existingTeam = getTeamForAdmin(db, userId);
  if (existingTeam) return existingTeam;

  const team = db.insert(teams).values({}).returning().get();
  db.insert(teamMembers)
    .values({ teamId: team.id, userId, role: TeamMemberRole.Admin })
    .run();
  return team;
}

function generateSeats(
  db: Db,
  teamId: number,
  courseId: number,
  purchaseId: number,
  quantity: number
): Seat[] {
  const created: Seat[] = [];
  for (let i = 0; i < quantity; i++) {
    const seat = db
      .insert(coupons)
      .values({
        teamId,
        courseId,
        code: crypto.randomBytes(12).toString("base64url"),
        purchaseId,
      })
      .returning()
      .get();
    created.push(seat);
  }
  return created;
}

/**
 * A Team Licence: the buyer becomes Team Admin and gets Seats, not an
 * Enrollment.
 */
export function buyTeamLicence(
  db: Db,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  quantity: number,
  now: Date
): { purchase: Purchase; team: Team; seats: Seat[] } {
  const purchase = createPurchase(
    db,
    userId,
    courseId,
    amountPaid,
    country,
    now
  );
  const team = getOrCreateTeamForUser(db, userId);
  const seats = generateSeats(db, team.id, courseId, purchase.id, quantity);
  return { purchase, team, seats };
}
