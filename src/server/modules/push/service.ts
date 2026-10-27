import "server-only";

import { and, count, eq, ne, sql } from "drizzle-orm";

import { deviceLabel } from "@/lib/device-label";
import {
  DEVICE_LABEL_MAX,
  PUSH_DEVICE_LIMIT,
  type PushPayload,
  type TestNotificationResult,
} from "@/lib/push";
import { db } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";

import { sendPush, type PushOutcome, type PushTarget } from "./send";
import type {
  PushDeviceIdInput,
  SubscribePushInput,
  UnsubscribePushInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it, except
// the upsert's endpoint match (see subscribePush). A device that is missing
// or belongs to someone else is the same NotFoundError.
//
// No audit events: a subscription is a device registration, like a
// session, not a change to the user's plans. Revoking hard-deletes the row,
// which would remove its events anyway (ADR 0005).

const DEVICE_LIMIT_MESSAGE = `You can turn notifications on for up to ${PUSH_DEVICE_LIMIT} devices. Revoke one you no longer use, then try again.`;

// In ON CONFLICT DO UPDATE, the bare table name is the existing row and
// `excluded` the proposed one.
const SAME_USER = sql.raw(
  `"push_subscriptions"."user_id" = excluded."user_id"`,
);

/**
 * Saves this browser's subscription for the user, or refreshes it when it
 * is already theirs. The endpoint identifies one browser, so when another
 * user had subscribed it (a shared computer), the row moves to this user
 * and starts over: the browser now delivers only to whoever subscribed it
 * last.
 */
export async function subscribePush(
  userId: string,
  input: SubscribePushInput,
  userAgent: string | null,
): Promise<{ id: string }> {
  const { endpoint, keys } = input.subscription;
  const label = deviceLabel(userAgent ?? "", input.maxTouchPoints).slice(
    0,
    DEVICE_LABEL_MAX,
  );

  return db.transaction(async (tx) => {
    // A soft cap: two subscribes racing at the limit could both pass.
    const [others] = await tx
      .select({ value: count() })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          ne(pushSubscriptions.endpoint, endpoint),
        ),
      );
    if ((others?.value ?? 0) >= PUSH_DEVICE_LIMIT) {
      throw new ConflictError(DEVICE_LIMIT_MESSAGE);
    }

    const [row] = await tx
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgentLabel: label,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: sql`excluded."user_id"`,
          p256dh: sql`excluded."p256dh"`,
          auth: sql`excluded."auth"`,
          userAgentLabel: sql`excluded."user_agent_label"`,
          createdAt: sql`case when ${SAME_USER} then "push_subscriptions"."created_at" else now() end`,
          lastSuccessAt: sql`case when ${SAME_USER} then "push_subscriptions"."last_success_at" end`,
          failedCount: sql`case when ${SAME_USER} then "push_subscriptions"."failed_count" else 0 end`,
        },
      })
      .returning({ id: pushSubscriptions.id });
    return { id: row!.id };
  });
}

/**
 * Turns notifications off for this browser: deletes its row if it is the
 * user's. Already gone is fine (revoked from another device, or removed
 * after the push service said 410), so this never fails for a missing row.
 */
export async function unsubscribePush(
  userId: string,
  { endpoint }: UnsubscribePushInput,
): Promise<{ removed: boolean }> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return { removed: removed.length > 0 };
}

/**
 * Revokes one of the user's devices from Settings. The browser keeps its
 * subscription, but with the row gone nothing is ever sent to it again.
 */
export async function revokePushDevice(
  userId: string,
  { id }: PushDeviceIdInput,
): Promise<void> {
  const removed = await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)),
    )
    .returning({ id: pushSubscriptions.id });
  if (removed.length === 0) throw new NotFoundError();
}

/** The user's subscriptions with what a push needs. Server-only: secrets. */
export async function pushTargetsFor(
  userId: string,
): Promise<(PushTarget & { id: string })[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/**
 * Records what the push service said about one send: a success stamps
 * `last_success_at` and clears the failure count, 404/410 deletes the
 * subscription, anything else counts a failure. Returns which it was.
 */
export async function recordPushOutcome(
  userId: string,
  subscriptionId: string,
  outcome: PushOutcome,
  at: Date,
): Promise<"sent" | "removed" | "failed"> {
  const mine = and(
    eq(pushSubscriptions.id, subscriptionId),
    eq(pushSubscriptions.userId, userId),
  );
  if (outcome.ok) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: at, failedCount: 0 })
      .where(mine);
    return "sent";
  }
  if (outcome.gone) {
    await db.delete(pushSubscriptions).where(mine);
    return "removed";
  }
  await db
    .update(pushSubscriptions)
    .set({ failedCount: sql`${pushSubscriptions.failedCount} + 1` })
    .where(mine);
  return "failed";
}

export const TEST_NOTIFICATION: PushPayload = {
  title: "SoleUp test notification",
  body: "Notifications work on this device.",
  url: "/settings",
  // A second test replaces the first instead of stacking up.
  tag: "soleup-test",
};

/** How long a push service keeps an undelivered test (a sleeping phone). */
const TEST_TTL_SECONDS = 5 * 60;

/**
 * Sends the test notification to every device the user has subscribed,
 * directly (there is no queue, ADR 0013), and records each outcome.
 * `failureCodes` are safe to log: status codes and error kinds only.
 */
export async function sendTestNotification(
  userId: string,
  now: Date = new Date(),
): Promise<TestNotificationResult & { failureCodes: string[] }> {
  const targets = await pushTargetsFor(userId);
  const outcomes = await Promise.all(
    targets.map((target) =>
      sendPush(target, TEST_NOTIFICATION, { ttlSeconds: TEST_TTL_SECONDS }),
    ),
  );

  const result = { total: targets.length, sent: 0, removed: 0, failed: 0 };
  const failureCodes: string[] = [];
  for (const [index, outcome] of outcomes.entries()) {
    const recorded = await recordPushOutcome(
      userId,
      targets[index]!.id,
      outcome,
      now,
    );
    result[recorded] += 1;
    if (!outcome.ok) failureCodes.push(outcome.code);
  }
  return { ...result, failureCodes };
}
