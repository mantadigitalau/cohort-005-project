import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { buyTeamLicence, isEnrolled } from "./enrollment.server";
import { claimSeat } from "./seat-claim.server";
import { createFakeNotifier, type FakeNotifier } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;
let notifier: FakeNotifier;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifier = createFakeNotifier();
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
  it("enrolls the claimant and marks the Seat claimed", async () => {
    const seat = buySeat();

    const result = await claimSeat(
      db,
      seat.code,
      base.user.id,
      "NL",
      NOW,
      notifier
    );

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

  it("refuses an unknown code", async () => {
    expect(
      await claimSeat(db, "nope", base.user.id, "NL", NOW, notifier)
    ).toEqual({
      ok: false,
      error: "Seat not found",
    });
  });

  it("refuses a Seat that is already claimed", async () => {
    const seat = buySeat();
    await claimSeat(db, seat.code, base.user.id, "NL", NOW, notifier);

    const result = await claimSeat(
      db,
      seat.code,
      base.instructor.id,
      "NL",
      NOW,
      notifier
    );

    expect(result).toEqual({
      ok: false,
      error: "This Seat has already been claimed",
    });
  });

  it("refuses a claimant who is already enrolled", async () => {
    const first = buySeat();
    const second = buySeat();
    await claimSeat(db, first.code, base.user.id, "NL", NOW, notifier);

    const result = await claimSeat(
      db,
      second.code,
      base.user.id,
      "NL",
      NOW,
      notifier
    );

    expect(result).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
  });

  it("refuses a claimant in a different country from the buyer", async () => {
    const seat = buySeat("NL");

    const result = await claimSeat(
      db,
      seat.code,
      base.user.id,
      "AU",
      NOW,
      notifier
    );

    expect(result.ok).toBe(false);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", async () => {
    const seat = buySeat();
    db.insert(schema.refunds)
      .values({
        purchaseId: seat.purchaseId,
        reason: "Changed plans",
        status: RefundStatus.Open,
      })
      .run();

    const result = await claimSeat(
      db,
      seat.code,
      base.user.id,
      "NL",
      NOW,
      notifier
    );

    expect(result).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });
});

describe("Notifications from claiming a Seat", () => {
  function buySeats(quantity: number) {
    return buyTeamLicence(
      db,
      teamAdmin.id,
      base.course.id,
      quantity * 7900,
      "NL",
      quantity,
      NOW
    ).seats;
  }

  it("tells the Team Admin who claimed it and how many Seats are left", async () => {
    const seats = buySeats(3);

    await claimSeat(db, seats[0].code, base.user.id, "NL", NOW, notifier);

    const seatClaimed = notifier.triggers.find(
      (n) => n.kind === "seat-claimed"
    );
    expect(seatClaimed).toEqual({
      kind: "seat-claimed",
      recipients: [expect.objectContaining({ id: teamAdmin.id })],
      actor: expect.objectContaining({
        id: base.user.id,
        name: base.user.name,
      }),
      data: {
        kind: "seat-claimed",
        courseId: base.course.id,
        courseTitle: base.course.title,
        courseSlug: base.course.slug,
        seatId: seats[0].id,
        seatsLeft: 2,
      },
      idempotencyKey: `seat-claimed:${seats[0].id}`,
    });
  });

  it("counts down the Seats left with each claim", async () => {
    const seats = buySeats(2);
    const ben = db
      .insert(schema.users)
      .values({ name: "Ben", email: "ben@example.com", role: UserRole.Student })
      .returning()
      .get();

    await claimSeat(db, seats[0].code, base.user.id, "NL", NOW, notifier);
    await claimSeat(db, seats[1].code, ben.id, "NL", NOW, notifier);

    expect(
      notifier.triggers
        .filter((n) => n.kind === "seat-claimed")
        .map((n) => n.data.seatsLeft)
    ).toEqual([1, 0]);
  });

  it("also tells the Instructor about the new Enrollment", async () => {
    const [seat] = buySeats(1);

    const result = await claimSeat(
      db,
      seat.code,
      base.user.id,
      "NL",
      NOW,
      notifier
    );
    if (!result.ok) throw new Error(result.error);

    expect(notifier.triggers).toHaveLength(2);
    expect(
      notifier.triggers.find((n) => n.kind === "new-enrollment")
    ).toMatchObject({
      recipients: [expect.objectContaining({ id: base.instructor.id })],
      actor: expect.objectContaining({ id: base.user.id }),
      idempotencyKey: `enrollment:${result.enrollment.id}`,
    });
  });

  it("sends no New Enrollment for buying the Team Licence, only for the claim", async () => {
    const [seat] = buySeats(1);

    await claimSeat(db, seat.code, base.user.id, "NL", NOW, notifier);

    expect(
      notifier.triggers
        .filter((n) => n.kind === "new-enrollment")
        .map((n) => n.actor?.id)
    ).toEqual([base.user.id]);
  });

  it("doesn't tell the Team Admin when they claim a Seat themselves", async () => {
    const [seat] = buySeats(1);

    await claimSeat(db, seat.code, teamAdmin.id, "NL", NOW, notifier);

    expect(notifier.triggers.map((n) => n.kind)).toEqual(["new-enrollment"]);
  });

  it("doesn't tell the Instructor when they claim a Seat on their own course", async () => {
    const [seat] = buySeats(1);

    await claimSeat(db, seat.code, base.instructor.id, "NL", NOW, notifier);

    expect(notifier.triggers.map((n) => n.kind)).toEqual(["seat-claimed"]);
  });

  it("sends nothing when the claim is refused", async () => {
    await claimSeat(db, "nope", base.user.id, "NL", NOW, notifier);

    expect(notifier.triggers).toEqual([]);
  });

  it("never fails the claim when sending throws", async () => {
    const [seat] = buySeats(1);
    const failing = createFakeNotifier();
    failing.trigger = async () => {
      throw new Error("Knock is down");
    };
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await claimSeat(
      db,
      seat.code,
      base.user.id,
      "NL",
      NOW,
      failing
    );

    expect(result.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});
