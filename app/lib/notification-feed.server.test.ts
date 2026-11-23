import { describe, it, expect } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { notificationFeedSession } from "./notification-feed.server";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const keyedEnv = {
  KNOCK_PUBLIC_API_KEY: "pk_test_abc",
  // Knock hands the signing key out base64-encoded, as it sits in .env.
  KNOCK_SIGNING_KEY: Buffer.from(
    privateKey.export({ type: "pkcs8", format: "pem" })
  ).toString("base64"),
  KNOCK_FEED_CHANNEL_ID: "feed-channel-1",
};

function decodeToken(token: string) {
  const [header, payload, signature] = token.split(".");
  const json = (part: string) =>
    JSON.parse(Buffer.from(part, "base64url").toString("utf-8"));
  return {
    header: json(header),
    payload: json(payload),
    signatureValid: verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url")
    ),
  };
}

async function sessionFor(userId: number) {
  const session = await notificationFeedSession(userId, keyedEnv);
  if (!session) throw new Error("Expected a feed session.");
  return session;
}

describe("the Notification Feed session handed to the browser", () => {
  it("is absent when there are no Knock keys, so the feed shows its empty state", async () => {
    expect(await notificationFeedSession(7, {})).toBeNull();
  });

  it("is absent when any one of the feed keys is missing", async () => {
    const { KNOCK_FEED_CHANNEL_ID: _, ...withoutChannel } = keyedEnv;
    expect(await notificationFeedSession(7, withoutChannel)).toBeNull();
  });

  it("carries the public key, the feed channel and the session user's id", async () => {
    expect(await sessionFor(7)).toMatchObject({
      userId: "7",
      publicApiKey: "pk_test_abc",
      feedChannelId: "feed-channel-1",
    });
  });

  it("signs an RS256 user token for the session user with the signing key", async () => {
    const token = decodeToken((await sessionFor(7)).userToken);

    expect(token.header).toMatchObject({ alg: "RS256" });
    expect(token.payload).toMatchObject({ sub: "7" });
    expect(token.signatureValid).toBe(true);
  });

  it("signs for whichever user the session now holds", async () => {
    const token = decodeToken((await sessionFor(12)).userToken);

    expect(token.payload).toMatchObject({ sub: "12" });
  });

  it("expires the token within an hour", async () => {
    const { payload } = decodeToken((await sessionFor(7)).userToken);

    expect(payload.exp - payload.iat).toBe(60 * 60);
  });
});
