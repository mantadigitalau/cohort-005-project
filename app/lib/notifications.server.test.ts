import { describe, it, expect, vi } from "vitest";
import { notifierFromEnv } from "./notifications.server";

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
