import type { Metadata } from "next";
import { Suspense } from "react";

import { PreferencesForm } from "@/components/preferences/preferences-form";
import { PushNotifications } from "@/components/push/push-notifications";
import { ReminderSettingsForm } from "@/components/reminders/reminder-settings-form";
import { InstallHelp } from "@/components/pwa/install-help";
import { LoadingState } from "@/components/ui/skeleton";
import { formatInstant } from "@/lib/dates";
import { localeOptions, supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import { env } from "@/server/env";
import {
  getReminderSettings,
  getUserPreferences,
} from "@/server/modules/preferences/service";
import { listPushDevices } from "@/server/modules/push/queries";

export const metadata: Metadata = { title: "Settings · SoleUp" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <section
        aria-labelledby="preferences-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="preferences-heading" className="text-lg font-semibold">
          Time and region
        </h2>
        <Suspense fallback={<LoadingState label="Loading settings" />}>
          <Preferences />
        </Suspense>
      </section>
      <section
        aria-labelledby="reminders-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="reminders-heading" className="text-lg font-semibold">
          Reminders
        </h2>
        <Suspense fallback={<LoadingState label="Loading reminder settings" />}>
          <Reminders />
        </Suspense>
      </section>
      <section
        aria-labelledby="install-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="install-heading" className="text-lg font-semibold">
          Install the app
        </h2>
        <InstallHelp />
      </section>
      <section
        aria-labelledby="notifications-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="notifications-heading" className="text-lg font-semibold">
          Notifications
        </h2>
        <Suspense fallback={<LoadingState label="Loading devices" />}>
          <Notifications />
        </Suspense>
      </section>
    </div>
  );
}

async function Preferences() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  return (
    <PreferencesForm
      mode="settings"
      initial={preferences}
      timeZones={supportedTimeZones()}
      locales={localeOptions(preferences.locale)}
    />
  );
}

async function Reminders() {
  const user = await requireUser();
  const [settings, devices] = await Promise.all([
    getReminderSettings(user.id),
    listPushDevices(user.id),
  ]);
  return (
    <ReminderSettingsForm initial={settings} hasDevice={devices.length > 0} />
  );
}

async function Notifications() {
  const user = await requireUser();
  const [preferences, devices] = await Promise.all([
    getUserPreferences(user.id),
    listPushDevices(user.id),
  ]);
  // Formatted here, so server and browser can't disagree while hydrating.
  const format = (instant: Date) =>
    formatInstant(instant, preferences.locale, preferences.timezone ?? "UTC");
  return (
    <PushNotifications
      vapidPublicKey={env.VAPID_PUBLIC_KEY}
      devices={devices.map((device) => ({
        id: device.id,
        label: device.label,
        endpointHash: device.endpointHash,
        added: format(device.createdAt),
        lastSuccess: device.lastSuccessAt && format(device.lastSuccessAt),
        failedCount: device.failedCount,
      }))}
    />
  );
}
