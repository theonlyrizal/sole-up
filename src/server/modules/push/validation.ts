import { z } from "zod";

import { isKnownPushService, PUSH_ENDPOINT_MAX } from "@/lib/push";

const UNSUPPORTED = "This browser's notifications can't be set up here.";

/** Unpadded base64url of exactly `bytes` bytes (padding is stripped first). */
const base64UrlKey = (bytes: number, check?: (raw: Buffer) => boolean) =>
  z
    .string({ error: UNSUPPORTED })
    .transform((value) => value.replace(/=+$/, ""))
    .refine(
      (value) => {
        if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
        const raw = Buffer.from(value, "base64url");
        return raw.length === bytes && (check?.(raw) ?? true);
      },
      { error: UNSUPPORTED },
    );

const endpointSchema = z
  .string({ error: UNSUPPORTED })
  .max(PUSH_ENDPOINT_MAX, UNSUPPORTED)
  .refine(isKnownPushService, {
    error: "This browser's push service isn't supported yet.",
  });

/**
 * A browser's `PushSubscription.toJSON()`, plus the touch-point count that
 * tells an iPad from a Mac for the device label. `expirationTime` is
 * accepted and ignored: browsers rarely set it, and a lapsed subscription
 * is removed when the push service answers 404 or 410.
 */
export const subscribePushSchema = z.strictObject({
  subscription: z.object({
    endpoint: endpointSchema,
    expirationTime: z.number().nullish(),
    keys: z.object({
      // An uncompressed P-256 point: 65 bytes starting with 0x04.
      p256dh: base64UrlKey(65, (raw) => raw[0] === 0x04),
      auth: base64UrlKey(16),
    }),
  }),
  maxTouchPoints: z.number().int().min(0).max(256).default(0),
});

/** This browser's own endpoint, to turn notifications off on it. */
export const unsubscribePushSchema = z.strictObject({
  endpoint: z.string().min(1).max(PUSH_ENDPOINT_MAX),
});

export const pushDeviceIdSchema = z.strictObject({
  id: z.uuid("Choose a device."),
});

export const sendTestNotificationSchema = z.strictObject({});

export type SubscribePushInput = z.output<typeof subscribePushSchema>;
export type UnsubscribePushInput = z.output<typeof unsubscribePushSchema>;
export type PushDeviceIdInput = z.output<typeof pushDeviceIdSchema>;
