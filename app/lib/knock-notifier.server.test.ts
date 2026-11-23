import { describe, it, expect } from "vitest";
import { NotFoundError } from "@knocklabs/node";
import { knockNotifier, type KnockClient } from "./knock-notifier.server";

// A stand-in for the Knock SDK, so these tests never contact Knock. It holds
// one preference set per user, like Knock's "default" set, and a list of
// sent messages with the data each was triggered with.
function createStubKnock(
  preferenceSets: Record<string, Record<string, unknown>> = {},
  sentMessages: { id: string; data: Record<string, unknown> }[] = []
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

  const messageQueries: Record<string, unknown>[] = [];
  const archived: string[][] = [];

  const messages = {
    // Knock's list returns a page you can iterate for every item. Like
    // Knock, it matches trigger_data against each message's data.
    list(query: { trigger_data?: string }) {
      messageQueries.push(query);
      const wanted = JSON.parse(query.trigger_data ?? "{}");
      const matching = sentMessages.filter((message) =>
        Object.entries(wanted).every(
          ([key, value]) => message.data[key] === value
        )
      );
      return (async function* () {
        yield* matching;
      })();
    },
    batch: {
      async archive(body: { message_ids: string[] }) {
        // Knock answers an empty batch with a 422.
        if (body.message_ids.length === 0) {
          throw new Error("422: message_ids must not be empty");
        }
        archived.push(body.message_ids);
        return [];
      },
    },
  };

  const client = {
    users,
    messages,
    workflows: { async trigger() {} },
  } as unknown as KnockClient;

  return { client, identified, preferenceWrites, messageQueries, archived };
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

  it("starts from the defaults when the user has no preference set yet, so Enrollments stays off", async () => {
    const knock = createStubKnock();

    await knockNotifier(knock.client).setPreference(
      12,
      "discussion-replies",
      "feed",
      false
    );

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
            "discussion-replies": { channel_types: { in_app_feed: false } },
          },
        },
      },
    ]);
  });

  it("starts from the defaults when the user's set is empty", async () => {
    const knock = createStubKnock({ "12": { categories: {} } });

    await knockNotifier(knock.client).setPreference(12, "enrollments", "feed", true);

    expect(knock.preferenceWrites[0].body).toMatchObject({
      categories: {
        enrollments: { channel_types: { in_app_feed: true } },
        "seat-claims": { channel_types: { in_app_feed: true } },
      },
    });
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

  it("ignores settings it can't read rather than trusting them", async () => {
    const knock = createStubKnock({
      "12": {
        categories: {
          enrollments: "yes please",
          "seat-claims": { channel_types: { in_app_feed: "on" } },
          "discussion-replies": false,
        },
      },
    });

    expect(await knockNotifier(knock.client).getPreferences(12)).toEqual({
      "seat-claims": {},
      "discussion-replies": { feed: false },
    });
  });

  it("reads a missing set as no preferences", async () => {
    const knock = createStubKnock();

    expect(await knockNotifier(knock.client).getPreferences(12)).toEqual({});
  });
});

describe("archiving a comment's Notifications in Knock", () => {
  it("archives every message triggered with that comment id, and no others", async () => {
    const knock = createStubKnock({}, [
      { id: "msg-question", data: { kind: "discussion-question", commentId: 7 } },
      { id: "msg-reply", data: { kind: "discussion-reply", commentId: 8 } },
      { id: "msg-refund", data: { kind: "refund-request-approved" } },
    ]);

    await knockNotifier(knock.client).archiveByComment(7);

    expect(knock.messageQueries).toEqual([
      { trigger_data: JSON.stringify({ commentId: 7 }) },
    ]);
    expect(knock.archived).toEqual([["msg-question"]]);
  });

  it("sends no archive request when the comment caused no messages", async () => {
    const knock = createStubKnock({}, [
      { id: "msg-reply", data: { kind: "discussion-reply", commentId: 8 } },
    ]);

    await knockNotifier(knock.client).archiveByComment(7);

    expect(knock.archived).toEqual([]);
  });
});
