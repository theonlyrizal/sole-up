import "server-only";

import webpush from "web-push";

import type { PushPayload } from "@/lib/push";
import { env } from "@/server/env";

/** The parts of a subscription a push needs. All three are secrets. */
export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * What the push service said. `gone` (404 or 410) means the subscription no
 * longer exists and should be deleted. `code` is safe to log and store:
 * `http_<status>`, `timeout`, `network`, or `invalid` (refused before sending).
 */
export type PushOutcome =
  { ok: true } | { ok: false; gone: boolean; code: string };

export type SendPushOptions = {
  /** How long the push service keeps an undelivered push (seconds, ≥ 60). */
  ttlSeconds: number;
  urgency?: "very-low" | "low" | "normal" | "high";
};

/** How long to wait for the push service before giving up. */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Sends one encrypted push with our VAPID key, and never throws: every
 * failure becomes an outcome. Nothing here logs, because the request, the
 * error (it carries the endpoint and response body) and the payload all
 * hold secrets or content. Callers log outcome codes only.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  { ttlSeconds, urgency = "normal" }: SendPushOptions,
): Promise<PushOutcome> {
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
        TTL: Math.max(60, Math.round(ttlSeconds)),
        urgency,
        timeout: SEND_TIMEOUT_MS,
      },
    );
    return { ok: true };
  } catch (error) {
    return failureOutcome(error);
  }
}

function failureOutcome(error: unknown): PushOutcome {
  if (error instanceof webpush.WebPushError) {
    const status = error.statusCode;
    return {
      ok: false,
      gone: status === 404 || status === 410,
      code: `http_${status}`,
    };
  }
  // web-push destroys a request that runs past `timeout` with this message.
  if (error instanceof Error && /socket timeout/i.test(error.message))
    return { ok: false, gone: false, code: "timeout" };
  // Node's system errors (ENOTFOUND, ECONNRESET, …) carry a string `code`.
  if (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string"
  )
    return { ok: false, gone: false, code: "network" };
  // Anything else was refused before sending (a malformed subscription).
  return { ok: false, gone: false, code: "invalid" };
}
