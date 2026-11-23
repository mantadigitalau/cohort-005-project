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
  users,
} from "~/db/schema";
import {
  notifySafely,
  type Notification,
  type NotificationPort,
  type NotificationUser,
} from "~/lib/notifications.server";
import type { Db } from "~/lib/refunds.server";

// ─── Enrollment ───
// Giving a Student an Enrollment, and the Purchases that lead to one (or, for a
// Team Licence, to Seats instead). See GLOSSARY.md for the language.
//
// Every function takes the database first and the current time last (then the
// Notification port, for those that send one), so tests can hand in an
// in-memory database, a fixed clock and a fake notifier. Uses positional
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

/**
 * An Individual Purchase: the buyer pays and gets an Enrollment, and the
 * course's Instructor gets a New Enrollment Notification.
 */
export async function buyIndividualPurchase(
  db: Db,
  userId: number,
  courseId: number,
  amountPaid: number,
  country: string | null,
  now: Date,
  notifier: NotificationPort
): Promise<IndividualPurchaseResult> {
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
  await notifyNewEnrollment(db, enrollment, notifier);
  return { ok: true, purchase, enrollment };
}

// ─── Notifications ───

export function getNotificationUser(db: Db, userId: number): NotificationUser {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`User ${userId} not found.`);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Tells the course's Instructor that a Student enrolled, by an Individual
 * Purchase or a Claimed Seat. A failure never fails the enrolment.
 */
export async function notifyNewEnrollment(
  db: Db,
  enrollment: Enrollment,
  notifier: NotificationPort
): Promise<void> {
  await notifySafely(notifier, () => newEnrollmentNotification(db, enrollment));
}

function newEnrollmentNotification(
  db: Db,
  enrollment: Enrollment
): Notification {
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, enrollment.courseId))
    .get();
  if (!course) throw new Error(`Course ${enrollment.courseId} not found.`);

  return {
    kind: "new-enrollment",
    recipients: [getNotificationUser(db, course.instructorId)],
    actor: getNotificationUser(db, enrollment.userId),
    data: {
      kind: "new-enrollment",
      courseId: course.id,
      courseTitle: course.title,
      courseSlug: course.slug,
      enrollmentId: enrollment.id,
    },
    idempotencyKey: `enrollment:${enrollment.id}`,
  };
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
