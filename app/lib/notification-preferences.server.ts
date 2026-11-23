import { and, eq } from "drizzle-orm";
import {
  coupons,
  courses,
  purchases,
  teamMembers,
  TeamMemberRole,
  UserRole,
  users,
} from "~/db/schema";
import type { Db } from "~/lib/users.server";
import {
  DEFAULT_PREFERENCES,
  type NotificationPort,
  type PreferenceCategory,
} from "~/lib/notifications.server";

// ─── Notification preferences ───
// Which switches a person sees on /settings, and whether each is on. A person
// only sees the categories they could actually get Notifications for, based on
// what they are or have (a Purchase, a Team Licence, a course they teach)
// rather than their role label alone. A hidden switch keeps its stored value,
// or the default, so it appears already set when the person later qualifies.
//
// Only the `feed` channel is shown in v1.

export type PreferenceSwitch = {
  category: PreferenceCategory;
  enabled: boolean;
};

/** What a person is or has that decides which switches they see. */
type Standing = {
  hasPurchase: boolean;
  isPlatformAdmin: boolean;
  isTeamAdmin: boolean;
  isInstructor: boolean;
};

/** In display order: the switch, and who it is shown to. */
const VISIBILITY: [PreferenceCategory, (standing: Standing) => boolean][] = [
  ["refund-request-updates", (standing) => standing.hasPurchase],
  ["open-refund-requests", (standing) => standing.isPlatformAdmin],
  ["seat-claims", (standing) => standing.isTeamAdmin],
  ["enrollments", (standing) => standing.isInstructor],
  ["discussion-questions", (standing) => standing.isInstructor],
  ["discussion-replies", () => true],
];

function getStanding(db: Db, userId: number): Standing {
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  const purchase = db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .get();

  // A Team Licence is a Purchase whose Seats (coupons) belong to the team.
  const teamLicence = db
    .select({ id: coupons.id })
    .from(teamMembers)
    .innerJoin(coupons, eq(coupons.teamId, teamMembers.teamId))
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  const taughtCourse = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, userId))
    .get();

  return {
    hasPurchase: purchase !== undefined,
    isPlatformAdmin: user?.role === UserRole.Admin,
    isTeamAdmin: teamLicence !== undefined,
    isInstructor:
      user?.role === UserRole.Instructor || taughtCourse !== undefined,
  };
}

/** The switches a person sees on /settings, with their current values. */
export async function getPreferenceSwitches(
  db: Db,
  notifier: NotificationPort,
  userId: number
): Promise<PreferenceSwitch[]> {
  const standing = getStanding(db, userId);
  const preferences = await notifier.getPreferences(userId);

  return VISIBILITY.filter(([, isShown]) => isShown(standing)).map(
    ([category]) => ({
      category,
      enabled:
        preferences[category]?.feed ?? DEFAULT_PREFERENCES[category].feed,
    })
  );
}
