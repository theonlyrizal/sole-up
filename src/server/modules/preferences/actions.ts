"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import * as service from "./service";
import {
  savePreferencesSchema,
  saveReminderSettingsSchema,
} from "./validation";

/** Saves time zone, locale and week start for the signed-in user. */
export const savePreferences = authedAction(
  savePreferencesSchema,
  async (input, { userId }) => {
    const preferences = await service.savePreferences(userId, input);
    // Pages read the time zone on the server (e.g. what "today" is).
    refresh();
    return preferences;
  },
);

/**
 * Settings' Reminders form: on/off, private mode, quiet hours, the nudge,
 * the weekly review reminder.
 */
export const saveReminderSettings = authedAction(
  saveReminderSettingsSchema,
  async (input, { userId }) => {
    const settings = await service.saveReminderSettings(userId, input);
    refresh();
    return settings;
  },
);
