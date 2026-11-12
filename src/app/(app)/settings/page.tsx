import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PreferencesForm } from "@/components/preferences/preferences-form";
import { PushNotifications } from "@/components/push/push-notifications";
import { ReminderSettingsForm } from "@/components/reminders/reminder-settings-form";
import { InstallHelp } from "@/components/pwa/install-help";
import { buttonClass } from "@/components/ui/button";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { DELETE_ACCOUNT_PATH } from "@/lib/account-deletion";
import { formatInstant } from "@/lib/dates";
import { localeOptions, supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import { env } from "@/server/env";
import {
  getReminderSettings,
  getUserPreferences,
} from "@/server/modules/preferences/service";
import { listPushDevices } from "@/server/modules/push/queries";
import { sweepHealth } from "@/server/modules/reminders/sweep-status";

export const metadata: Metadata = { title: "Settings · SoleUp" };

export default function SettingsPage() {
  return (
    <PageFrame title="Settings" width="reading">
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
      <section aria-labelledby="export-heading" className="flex flex-col gap-4">
        <h2 id="export-heading" className="text-lg font-semibold">
          Export
        </h2>
        <p className="text-muted-fg text-sm">
          Download your SoleUp data as a JSON file, including a Markdown copy of
          each note. The file contains personal data, so store it somewhere
          private.
        </p>
        <a
          href="/api/export"
          className={buttonClass({
            variant: "secondary",
            className: "self-start",
          })}
        >
          Download export
        </a>
      </section>
      <section aria-labelledby="delete-heading" className="flex flex-col gap-4">
        <h2 id="delete-heading" className="text-lg font-semibold">
          Delete account
        </h2>
        <p className="text-muted-fg text-sm">
          Close your account with a 30-day reactivation period.
        </p>
        <Link
          href={DELETE_ACCOUNT_PATH}
          className={buttonClass({
            variant: "danger",
            className: "self-start",
          })}
        >
          Delete account
        </Link>
      </section>
      <section
        aria-labelledby="privacy-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="privacy-heading" className="text-lg font-semibold">
          Privacy
        </h2>
        <Link
          href="/privacy"
          className="text-accent underline underline-offset-4"
        >
          Privacy notes
        </Link>
      </section>
    </PageFrame>
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
  const [settings, devices, preferences, sweeps] = await Promise.all([
    getReminderSettings(user.id),
    listPushDevices(user.id),
    getUserPreferences(user.id),
    sweepHealth(),
  ]);
  // Formatted here, so server and browser can't disagree while hydrating.
  const sweepsStopped = sweeps.overdue
    ? {
        lastSweep:
          sweeps.lastSweepAt &&
          formatInstant(
            sweeps.lastSweepAt,
            preferences.locale,
            preferences.timezone ?? "UTC",
          ),
      }
    : null;
  return (
    <ReminderSettingsForm
      initial={settings}
      hasDevice={devices.length > 0}
      sweepsStopped={sweepsStopped}
    />
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
