import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";

import {
  AppearanceSetting,
  AppearanceSummary,
} from "@/components/preferences/appearance-setting";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { PushNotifications } from "@/components/push/push-notifications";
import { InstallHelp, InstallSummary } from "@/components/pwa/install-help";
import { ReminderSettingsForm } from "@/components/reminders/reminder-settings-form";
import {
  NotificationSummary,
  NotificationSummaryProvider,
} from "@/components/settings/notification-summary";
import {
  SettingsIndex,
  type SettingsIndexItem,
} from "@/components/settings/settings-index";
import { ACCOUNT_PATH } from "@/components/shell/nav-items";
import { PageFrame } from "@/components/shell/page-frame";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { InlineBanner } from "@/components/ui/inline-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInstant } from "@/lib/dates";
import {
  localeLabel,
  localeOptions,
  supportedTimeZones,
} from "@/lib/preferences";
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
  {
    id: "appearance",
    title: "Appearance",
    icon: "contrast",
    keywords: "theme color dark mode light system",
  },
  {
    id: "reminders",
    title: "Reminders",
    icon: "schedule",
    keywords: "quiet hours sounds daily planning nudge weekly review private",
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: "notifications",
    keywords: "alerts push browser permission devices",
  },
  {
    id: "time-region",
    title: "Time and region",
    icon: "language",
    keywords: "time zone timezone locale language calendar week start",
  },
  {
    id: "install",
    title: "Install the app",
    icon: "install_mobile",
    keywords: "home screen shortcut dock android iphone pwa",
  },
  {
    id: "account",
    title: "Account",
    icon: "person",
    keywords:
      "profile email export download data privacy delete sign out providers",
  },
] as const satisfies readonly SettingsIndexItem[];

const [appearance, reminders, notifications, timeRegion, install, account] =
  sections;
const getUser = cache(requireUser);
const readPreferences = cache(async () =>
  getUserPreferences((await getUser()).id),
);
const readReminders = cache(async () =>
  getReminderSettings((await getUser()).id),
);
const readDevices = cache(async () => listPushDevices((await getUser()).id));

export default function SettingsPage() {
  return (
    <PageFrame
      title="Settings"
      mobileHeader={<TopAppBar title="Settings" opaque />}
    >
      <div className="grid min-w-0 gap-4 [--duration-default-effects:0ms]">
        <Suspense>
          <DeliveryAlerts />
        </Suspense>
        <NotificationSummaryProvider>
          <div className="grid min-w-0 gap-6 medium:grid-cols-10 medium:items-start medium:max-large:gap-4">
            <div className="medium:col-span-3 large:sticky large:top-4 large:max-h-[calc(100dvh-2rem)] large:overflow-y-auto large:p-1">
              <SettingsIndex
                items={sections}
                summaries={{
                  appearance: <AppearanceSummary />,
                  reminders: (
                    <Suspense fallback="Loading…">
                      <RemindersSummary />
                    </Suspense>
                  ),
                  notifications: <NotificationSummary />,
                  "time-region": (
                    <Suspense fallback="Loading…">
                      <TimeSummary />
                    </Suspense>
                  ),
                  install: <InstallSummary />,
                  account: "Profile and data",
                }}
              />
            </div>
            <div className="grid w-full max-w-180 min-w-0 gap-4 medium:col-span-7">
              <SettingsSection item={appearance}>
                <AppearanceSetting />
              </SettingsSection>
              <SettingsSection item={reminders}>
                <Suspense
                  fallback={
                    <SectionSkeleton label="Loading reminder settings" />
                  }
                >
                  <Reminders />
                </Suspense>
              </SettingsSection>
              <SettingsSection item={notifications}>
                <Suspense
                  fallback={<SectionSkeleton label="Loading devices" />}
                >
                  <Notifications />
                </Suspense>
              </SettingsSection>
              <SettingsSection item={timeRegion}>
                <Suspense
                  fallback={<SectionSkeleton label="Loading time and region" />}
                >
                  <Preferences />
                </Suspense>
              </SettingsSection>
              <SettingsSection item={install}>
                <InstallHelp />
              </SettingsSection>
              <SettingsSection item={account}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-body-medium text-on-surface-variant">
                    Profile, sign-in and your data.
                  </p>
                  <Link
                    href={ACCOUNT_PATH}
                    className={buttonClass({ variant: "secondary" })}
                  >
                    Open account
                  </Link>
                </div>
              </SettingsSection>
            </div>
          </div>
        </NotificationSummaryProvider>
      </div>
    </PageFrame>
  );
}

function SettingsSection({
  item,
  children,
}: {
  item: SettingsIndexItem;
  children: ReactNode;
}) {
  const headingId = `${item.id}-heading`;
  return (
    <div
      id={item.id}
      tabIndex={-1}
      role="group"
      aria-labelledby={headingId}
      className="scroll-mt-4 rounded-2xl"
    >
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

async function TimeSummary() {
  const { timezone, locale } = await readPreferences();
  return [timezone?.replaceAll("_", " "), localeLabel(locale)]
    .filter(Boolean)
    .join(" · ");
}

async function RemindersSummary() {
  const { remindersEnabled } = await readReminders();
  return remindersEnabled ? "On" : "Off";
}

async function DeliveryAlerts() {
  const [settings, devices] = await Promise.all([
    readReminders(),
    readDevices(),
  ]);
  const sweeps = settings.remindersEnabled ? await sweepHealth() : null;
  const stopped = sweeps?.overdue;
  if (!stopped && devices.length > 0) return null;
  const lastSweepAt = sweeps?.lastSweepAt;
  const lastSweep =
    stopped && lastSweepAt
      ? await readPreferences().then(({ locale, timezone }) =>
          formatInstant(lastSweepAt, locale, timezone ?? "UTC"),
        )
      : null;

  return (
    <div className="grid gap-2">
      {stopped && (
        <InlineBanner
          tone="warning"
          title="Reminder delivery paused"
          action={
            <a
              href="#reminders"
              className={buttonClass({
                variant: "text",
                size: "xs",
                className: "text-on-alert-container",
              })}
            >
              Review reminders
            </a>
          }
        >
          {lastSweep
            ? `Reminders were last checked ${lastSweep}, over an hour ago. Delivery will resume when the regular check runs again.`
            : "Reminders haven't been checked yet. Delivery will start when the regular check runs."}
        </InlineBanner>
      )}
      {devices.length === 0 && (
        <InlineBanner
          title="No notification devices"
          action={
            <a
              href="#notifications"
              className={buttonClass({ variant: "text", size: "xs" })}
            >
              Set up notifications
            </a>
          }
        >
          No device is set up for notifications yet, so reminders can&apos;t
          reach you.
        </InlineBanner>
      )}
    </div>
  );
}

async function Preferences() {
  const preferences = await readPreferences();
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
  return <ReminderSettingsForm initial={await readReminders()} />;
}

async function Notifications() {
  const [preferences, devices] = await Promise.all([
    readPreferences(),
    readDevices(),
  ]);
  // Format here so hydration uses the same text as the server.
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
