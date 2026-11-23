import { describe, it, expect } from "vitest";
import { NotFoundError } from "@knocklabs/node";
import { knockNotifier, type KnockClient } from "./knock-notifier.server";

// A stand-in for the Knock SDK, so these tests never contact Knock. It holds
// one preference set per user, like Knock's "default" set.
function createStubKnock(
  preferenceSets: Record<string, Record<string, unknown>> = {}
) {
  const identified: { id: string; body: Record<string, unknown> }[] = [];
  const preferenceWrites: { id: string; body: Record<string, unknown> }[] = [];

  const users = {
    async update(id: string, body: Record<string, unknown>) {
      identified.push({ id, body });
      return { id };
    },
    async getPreferences(id: string, setId: string) {
      const set = preferenceSets[id];
      if (!set) {
        throw new NotFoundError(404, undefined, "not found", new Headers());
      }
      return { id: setId, ...set };
    },
    async setPreferences(id: string, setId: string, body: Record<string, unknown>) {
      preferenceWrites.push({ id, body });
      preferenceSets[id] = body;
      return { id: setId, ...body };
    },
  };

  const client = {
    users,
    workflows: { async trigger() {} },
  } as unknown as KnockClient;

  return { client, identified, preferenceWrites };
}

const MAYA = {
  id: 12,
  name: "Maya Chen",
  email: "maya@example.com",
  avatarUrl: "https://example.com/maya.png",
};

describe("syncing a user to Knock", () => {
  it("sends the profile, including the avatar", async () => {
    const knock = createStubKnock();

    await knockNotifier(knock.client).syncUser(MAYA);

    expect(knock.identified).toEqual([
      {
        id: "12",
        body: {
          name: "Maya Chen",
          email: "maya@example.com",
          avatar: "https://example.com/maya.png",
        },
      },
    ]);
  });

  it("writes the default set when the user has no preferences: Enrollments off, the rest on", async () => {
    const knock = createStubKnock();

    await knockNotifier(knock.client).syncUser(MAYA);

    expect(knock.preferenceWrites).toEqual([
      {
        id: "12",
        body: {
          categories: {
            "refund-request-updates": { channel_types: { in_app_feed: true } },
            "open-refund-requests": { channel_types: { in_app_feed: true } },
            "seat-claims": { channel_types: { in_app_feed: true } },
            enrollments: { channel_types: { in_app_feed: false } },
            "discussion-questions": { channel_types: { in_app_feed: true } },
            "discussion-replies": { channel_types: { in_app_feed: true } },
          },
        },
      },
    ]);
  });

  it("leaves existing preferences alone", async () => {
    const knock = createStubKnock({
      "12": {
        categories: { enrollments: { channel_types: { in_app_feed: true } } },
      },
    });

    await knockNotifier(knock.client).syncUser(MAYA);

    expect(knock.identified).toHaveLength(1);
    expect(knock.preferenceWrites).toEqual([]);
  });
});

describe("changing one preference in Knock", () => {
  it("merges the one category into the existing set, leaving every other category untouched", async () => {
    const knock = createStubKnock({
      "12": {
        categories: {
          "refund-request-updates": { channel_types: { in_app_feed: true } },
          enrollments: { channel_types: { in_app_feed: true } },
          "discussion-replies": { channel_types: { in_app_feed: false } },
        },
      },
    });

    await knockNotifier(knock.client).setPreference(
      12,
      "discussion-replies",
      "feed",
      true
    );

    expect(knock.preferenceWrites).toEqual([
      {
        id: "12",
        body: {
          categories: {
            "refund-request-updates": { channel_types: { in_app_feed: true } },
            enrollments: { channel_types: { in_app_feed: true } },
            "discussion-replies": { channel_types: { in_app_feed: true } },
          },
        },
      },
    ]);
  });

  it("keeps the changed category's other channels", async () => {
    const knock = createStubKnock({
      "12": {
        categories: {
          enrollments: { channel_types: { in_app_feed: false, email: true } },
        },
      },
    });

    await knockNotifier(knock.client).setPreference(12, "enrollments", "feed", true);

    expect(knock.preferenceWrites[0].body).toEqual({
      categories: {
        enrollments: { channel_types: { in_app_feed: true, email: true } },
      },
    });
  });

  it("starts from nothing when the user has no preference set yet", async () => {
    const knock = createStubKnock();

    await knockNotifier(knock.client).setPreference(12, "enrollments", "feed", true);

    expect(knock.preferenceWrites).toEqual([
      {
        id: "12",
        body: {
          categories: { enrollments: { channel_types: { in_app_feed: true } } },
        },
      },
    ]);
  });
});

describe("reading preferences from Knock", () => {
  it("maps Knock's categories and channel types back to Cadence's", async () => {
    const knock = createStubKnock({
      "12": {
        categories: {
          enrollments: { channel_types: { in_app_feed: true } },
          "seat-claims": { channel_types: { in_app_feed: false } },
        },
      },
    });

    const preferences = await knockNotifier(knock.client).getPreferences(12);

    expect(preferences).toEqual({
      enrollments: { feed: true },
      "seat-claims": { feed: false },
    });
  });

  it("reads a missing set as no preferences", async () => {
    const knock = createStubKnock();

    expect(await knockNotifier(knock.client).getPreferences(12)).toEqual({});
  });
});
