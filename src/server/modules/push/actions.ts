"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";

import type { TestNotificationResult } from "@/lib/push";
import { authedAction } from "@/server/auth/authed-action";
import { getRequestLogger } from "@/server/logging/request";

import * as service from "./service";
import {
  pushDeviceIdSchema,
  sendTestNotificationSchema,
  subscribePushSchema,
  unsubscribePushSchema,
} from "./validation";

// Auth → validate → service (scoped to the user) → refresh Settings.
// Subscription keys and endpoints are never logged or returned.

/** Saves this browser's push subscription for the signed-in user. */
export const subscribePush = authedAction(
  subscribePushSchema,
  async (input, { userId }) => {
    const userAgent = (await headers()).get("user-agent");
    const device = await service.subscribePush(userId, input, userAgent);
    refresh();
    return device;
  },
);

/** Turns notifications off for this browser. */
export const unsubscribePush = authedAction(
  unsubscribePushSchema,
  async (input, { userId }) => {
    const result = await service.unsubscribePush(userId, input);
    refresh();
    return result;
  },
);

/** Revokes one of the user's devices from the Settings list. */
export const revokePushDevice = authedAction(
  pushDeviceIdSchema,
  async (input, { userId }) => {
    await service.revokePushDevice(userId, input);
    refresh();
  },
);

/** Sends the test notification to every device the user has subscribed. */
export const sendTestNotification = authedAction(
  sendTestNotificationSchema,
  async (_input, { userId }): Promise<TestNotificationResult> => {
    const { failureCodes, ...result } =
      await service.sendTestNotification(userId);
    (await getRequestLogger()).info(
      { source: "push", ...result, failureCodes },
      "Test notification sent",
    );
    refresh();
    return result;
  },
);
