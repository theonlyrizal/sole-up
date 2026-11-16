import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { AppearanceSetting } from "@/components/preferences/appearance-setting";
import {
  SettingsIndex,
  type SettingsIndexItem,
} from "@/components/settings/settings-index";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { PushNotifications } from "@/components/push/push-notifications";
import { ReminderSettingsForm } from "@/components/reminders/reminder-settings-form";
import { InstallHelp } from "@/components/pwa/install-help";
import { buttonClass } from "@/components/ui/button";
import { PageFrame } from "@/components/shell/page-frame";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

const sections = [
  { id: "time-region", title: "Time and region", icon: "language" },
  { id: "appearance", title: "Appearance", icon: "contrast" },
  { id: "reminders", title: "Reminders", icon: "schedule" },
  { id: "notifications", title: "Notifications", icon: "notifications" },
  { id: "install", title: "Install the app", icon: "install_mobile" },
  { id: "account", title: "Account", icon: "person" },
] as const satisfies readonly SettingsIndexItem[];

export default function SettingsPage() {
  return (
    <PageFrame
      title="Settings"
      mobileHeader={<TopAppBar title="Settings" opaque />}
    >
      {/* Theme changes apply the foreground and surface colors together. */}
      <div className="grid min-w-0 gap-6 [--duration-default-effects:0ms] medium:grid-cols-10 medium:items-start medium:max-large:gap-4">
        <div className="medium:col-span-3 large:sticky large:top-8">
          <SettingsIndex items={sections} />
        </div>
        <div className="grid w-full max-w-180 min-w-0 gap-4 medium:col-span-7">
          <SettingsSection item={sections[0]}>
            <Suspense
              fallback={<SectionSkeleton label="Loading time and region" />}
            >
              <Preferences />
            </Suspense>
          </SettingsSection>
          <SettingsSection item={sections[1]}>
            <AppearanceSetting />
          </SettingsSection>
          <SettingsSection item={sections[2]}>
            <Suspense
              fallback={<SectionSkeleton label="Loading reminder settings" />}
            >
              <Reminders />
            </Suspense>
          </SettingsSection>
          <SettingsSection item={sections[3]}>
            <Suspense fallback={<SectionSkeleton label="Loading devices" />}>
              <Notifications />
            </Suspense>
          </SettingsSection>
          <SettingsSection item={sections[4]}>
            <InstallHelp />
          </SettingsSection>
          <SettingsSection item={sections[5]}>
            <Suspense fallback={<SectionSkeleton label="Loading account" />}>
              <Account />
            </Suspense>
          </SettingsSection>
          <Card headingId="export-heading" className="grid gap-3">
            <CardHeader title="Export" id="export-heading" />
            <p className="text-body-medium text-on-surface-variant">
              Download your SoleUp data as a JSON file, including a Markdown
              copy of each note. The file contains personal data, so store it
              somewhere private.
            </p>
            <a
              href="/api/export"
              className={buttonClass({ className: "justify-self-start" })}
            >
              Download export
            </a>
          </Card>
          <Card
            headingId="delete-heading"
            className="grid gap-3 border border-error"
          >
            <CardHeader title="Delete account" id="delete-heading" />
            <p className="text-body-medium text-on-surface-variant">
              Close your account with a 30-day reactivation period.
            </p>
            <Link
              href={DELETE_ACCOUNT_PATH}
              className={buttonClass({
                variant: "danger",
                className: "justify-self-start",
              })}
            >
              Delete account
            </Link>
          </Card>
          <Card headingId="privacy-heading" className="grid gap-3">
            <CardHeader title="Privacy" id="privacy-heading" />
            <Link
              href="/privacy"
              className={buttonClass({
                variant: "text",
                className: "justify-self-start",
              })}
            >
              Privacy notes
            </Link>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}

function SettingsSection({
  item,
  children,
}: {
  item: SettingsIndexItem;
  children: React.ReactNode;
}) {
  const headingId = `${item.id}-heading`;
  return (
    <div id={item.id} tabIndex={-1} className="scroll-mt-4 rounded-2xl">
      <Card headingId={headingId} className="grid gap-5">
        <CardHeader
          title={item.title}
          id={headingId}
          icon={item.icon}
          size="l"
        />
        {children}
      </Card>
    </div>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="grid gap-3">
      <span className="sr-only">{label}…</span>
      <Skeleton shape="list-item" className="h-14" />
      <Skeleton shape="list-item" className="h-14" />
    </div>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 text-body-large wrap-anywhere">{user.name}</p>
      <SignOutButton buttonTone="tonal" />
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
