import { describe, it, expect, vi } from "vitest";
import {
  createFakeNotifier,
  notifierFromEnv,
  notifySafely,
} from "./notifications.server";

describe("choosing a Notification adapter", () => {
  it("logs instead of sending when there is no Knock secret key", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await notifierFromEnv({}).trigger({
      kind: "refund-request-approved",
      recipients: [
        { id: 7, name: "Liam", email: "liam@example.com", avatarUrl: null },
      ],
      actor: null,
      data: { kind: "refund-request-approved" },
      idempotencyKey: "refund-approved:3",
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("refund-request-approved")
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("refund-approved:3")
    );
    log.mockRestore();
  });
});

describe("the fake adapter's preferences", () => {
  it("starts from the defaults when the user has none yet, so Enrollments stays off", async () => {
    const fake = createFakeNotifier();

    await fake.setPreference(7, "discussion-replies", "feed", false);

    expect(await fake.getPreferences(7)).toEqual({
      "refund-request-updates": { feed: true },
      "open-refund-requests": { feed: true },
      "seat-claims": { feed: true },
      enrollments: { feed: false },
      "discussion-questions": { feed: true },
      "discussion-replies": { feed: false },
    });
  });
});

describe("sending a Notification safely", () => {
  const ADA = { id: 1, name: "Ada", email: "ada@example.com", avatarUrl: null };
  const BEN = { id: 2, name: "Ben", email: "ben@example.com", avatarUrl: null };

  it("leaves the actor out of the recipients", async () => {
    const fake = createFakeNotifier();

    await notifySafely(fake, () => ({
      kind: "open-refund-request",
      recipients: [ADA, BEN],
      actor: ADA,
      data: { kind: "open-refund-request" },
      idempotencyKey: "refund-open:1",
    }));

    expect(fake.triggers.map((n) => n.recipients)).toEqual([[BEN]]);
  });

  it("sends nothing when the actor was the only recipient", async () => {
    const fake = createFakeNotifier();

    await notifySafely(fake, () => ({
      kind: "seat-claimed",
      recipients: [ADA],
      actor: ADA,
      data: { kind: "seat-claimed" },
      idempotencyKey: "seat-claimed:1",
    }));

    expect(fake.triggers).toEqual([]);
  });
});
