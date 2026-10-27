import { createECDH, createHash, randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUSH_DEVICE_LIMIT } from "@/lib/push";
import { db } from "@/server/db/client";
import { pushSubscriptions, users } from "@/server/db/schema";
import { env } from "@/server/env";

import { captureLogs } from "../../../../tests/helpers/logs";
import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { listPushDevices } from "./queries";
import { TEST_NOTIFICATION } from "./service";

// Pushes are mocked at the library boundary: nothing reaches a push service.
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof webpush }>();
  return { default: { ...actual.default, sendNotification } };
});

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

beforeEach(() => {
  requestHeaders.current = new Headers();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.restoreAllMocks());

async function signInAs(userId: string) {
  const { headers } = await asUser(userId);
  headers.set("user-agent", ANDROID_UA);
  requestHeaders.current = headers;
}

function browserSubscription(host = "fcm.googleapis.com") {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `https://${host}/fcm/send/${randomUUID()}`,
    expirationTime: null,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

async function subscribe(subscription = browserSubscription()) {
  const result = await actions.subscribePush({ subscription });
  expect(result.ok).toBe(true);
  return { subscription, id: result.ok ? result.data.id : "" };
}

const rowsFor = (userId: string) =>
  db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

describe("subscribe", () => {
  it("saves the subscription with a label from the user agent", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const { subscription } = await subscribe();
    const [row] = await rowsFor(user.id);
    expect(row).toMatchObject({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgentLabel: "Chrome on Android",
      failedCount: 0,
      lastSuccessAt: null,
    });
  });

  it("refreshes the same browser instead of adding a second row", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const first = await subscribe();
    const again = await subscribe({
      ...first.subscription,
      keys: browserSubscription().keys,
    });
    expect(again.id).toBe(first.id);
    expect(await rowsFor(user.id)).toHaveLength(1);
  });

  it("moves a browser to the user who subscribed it last", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await signInAs(alice.id);
    const { subscription } = await subscribe();
    await db
      .update(pushSubscriptions)
      .set({ failedCount: 2, lastSuccessAt: new Date() });
    await signInAs(bob.id);
    await subscribe(subscription);
    expect(await rowsFor(alice.id)).toHaveLength(0);
    const [row] = await rowsFor(bob.id);
    expect(row).toMatchObject({ failedCount: 0, lastSuccessAt: null });
  });

  it("caps the devices per user, but still refreshes an existing one", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const existing = await subscribe();
    for (let i = 1; i < PUSH_DEVICE_LIMIT; i++) await subscribe();
    const result = await actions.subscribePush({
      subscription: browserSubscription(),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    await subscribe(existing.subscription);
  });

  it.each([
    ["an unknown push service", { endpoint: "https://evil.example/push" }],
    ["plain http", { endpoint: "http://fcm.googleapis.com/fcm/send/x" }],
    ["a port", { endpoint: "https://fcm.googleapis.com:8443/fcm/send/x" }],
  ])("refuses an endpoint on %s", async (_name, change) => {
    const user = await createTestUser();
    await signInAs(user.id);
    const result = await actions.subscribePush({
      subscription: { ...browserSubscription(), ...change },
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { "subscription.endpoint": [expect.any(String)] },
      },
    });
    expect(await rowsFor(user.id)).toHaveLength(0);
  });

  it("refuses malformed keys", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const good = browserSubscription();
    for (const keys of [
      { ...good.keys, p256dh: good.keys.p256dh.slice(1) },
      { ...good.keys, auth: randomBytes(15).toString("base64url") },
    ]) {
      const result = await actions.subscribePush({
        subscription: { ...good, keys },
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    }
  });

  it("refuses anonymous callers", async () => {
    const result = await actions.subscribePush({
      subscription: browserSubscription(),
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("goes with the user's account", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    await subscribe();
    await db.delete(users).where(eq(users.id, user.id));
    expect(await rowsFor(user.id)).toHaveLength(0);
  });
});

describe("devices, unsubscribe and revoke", () => {
  it("lists only the user's devices, without endpoints or keys", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await signInAs(alice.id);
    const { subscription } = await subscribe();
    await signInAs(bob.id);
    await subscribe();
    const devices = await listPushDevices(alice.id);
    expect(devices).toHaveLength(1);
    expect(Object.keys(devices[0]!).sort()).toEqual([
      "createdAt",
      "endpointHash",
      "failedCount",
      "id",
      "label",
      "lastSuccessAt",
    ]);
    expect(devices[0]!.endpointHash).toBe(
      createHash("sha256").update(subscription.endpoint).digest("base64url"),
    );
  });

  it("unsubscribes only the user's own browser", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await signInAs(alice.id);
    const { subscription } = await subscribe();
    await signInAs(bob.id);
    expect(
      await actions.unsubscribePush({ endpoint: subscription.endpoint }),
    ).toEqual({ ok: true, data: { removed: false } });
    expect(await rowsFor(alice.id)).toHaveLength(1);
    await signInAs(alice.id);
    expect(
      await actions.unsubscribePush({ endpoint: subscription.endpoint }),
    ).toEqual({ ok: true, data: { removed: true } });
    expect(await rowsFor(alice.id)).toHaveLength(0);
  });

  it("revokes the user's device, and another user's is not found", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await signInAs(alice.id);
    const { id } = await subscribe();
    await signInAs(bob.id);
    expect(await actions.revokePushDevice({ id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    await signInAs(alice.id);
    expect(await actions.revokePushDevice({ id })).toMatchObject({ ok: true });
    expect(await rowsFor(alice.id)).toHaveLength(0);
  });
});

describe("test notification", () => {
  it("sends to every device and records each outcome", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const ok = await subscribe();
    const gone = await subscribe();
    const failing = await subscribe();
    await db
      .update(pushSubscriptions)
      .set({ failedCount: 1 })
      .where(eq(pushSubscriptions.id, ok.id));

    sendNotification.mockImplementation(
      async (target: { endpoint: string }) => {
        const status =
          target.endpoint === gone.subscription.endpoint
            ? 410
            : target.endpoint === failing.subscription.endpoint
              ? 500
              : null;
        if (status)
          throw new webpush.WebPushError(
            "refused",
            status,
            {},
            "",
            target.endpoint,
          );
        return { statusCode: 201 };
      },
    );

    const logs = captureLogs();
    const result = await actions.sendTestNotification({});
    expect(result).toEqual({
      ok: true,
      data: { total: 3, sent: 1, removed: 1, failed: 1 },
    });

    const rows = await rowsFor(user.id);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [ok.id, failing.id].sort(),
    );
    const okRow = rows.find((row) => row.id === ok.id)!;
    expect(okRow.lastSuccessAt).toBeInstanceOf(Date);
    expect(okRow.failedCount).toBe(0);
    expect(rows.find((row) => row.id === failing.id)!.failedCount).toBe(1);

    const [, payload, options] = sendNotification.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual(TEST_NOTIFICATION);
    expect(options).toMatchObject({
      TTL: 300,
      vapidDetails: {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
    });

    // One line with counts and codes; no endpoint, key, VAPID key or text.
    const text = logs.text();
    expect(text).toContain("Test notification sent");
    expect(text).toContain("http_500");
    for (const { subscription } of [ok, gone, failing]) {
      expect(text).not.toContain(subscription.endpoint);
      expect(text).not.toContain(subscription.keys.p256dh);
      expect(text).not.toContain(subscription.keys.auth);
    }
    expect(text).not.toContain(env.VAPID_PRIVATE_KEY);
    expect(text).not.toContain(TEST_NOTIFICATION.title);
  });

  it("maps network failures and timeouts to codes", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    await subscribe();
    await subscribe();
    sendNotification
      .mockRejectedValueOnce(
        Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }),
      )
      .mockRejectedValueOnce(new Error("Socket timeout"));
    const logs = captureLogs();
    const result = await actions.sendTestNotification({});
    expect(result).toMatchObject({ ok: true, data: { failed: 2 } });
    expect(logs.text()).toMatch(/"network"/);
    expect(logs.text()).toMatch(/"timeout"/);
  });

  it("sends nothing to other users' devices", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    await signInAs(alice.id);
    await subscribe();
    await signInAs(bob.id);
    captureLogs();
    expect(await actions.sendTestNotification({})).toEqual({
      ok: true,
      data: { total: 0, sent: 0, removed: 0, failed: 0 },
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
