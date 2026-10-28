"use server";

import { authedAction } from "@/server/auth/authed-action";

import * as snooze from "./snooze";
import { reminderStatusFor } from "./status";
import { reminderItemSchema, snoozeReminderSchema } from "./validation";

// Auth → validate → service (scoped to the user). No page shows reminder
// rows, so nothing is refreshed: the item's dialog reads its status again.

/** An item's reminder, read when its dialog opens. Changes nothing. */
export const getReminderStatus = authedAction(
  reminderItemSchema,
  (item, { userId }) => reminderStatusFor(userId, item),
);

/** Snoozes a reminder that went out, from the item's dialog. */
export const snoozeReminder = authedAction(
  snoozeReminderSchema,
  (input, { userId }) => snooze.snoozeReminder(userId, input),
);
