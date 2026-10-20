import type { Metadata } from "next";
import { Suspense } from "react";

import { PreferencesForm } from "@/components/preferences/preferences-form";
import { LoadingState } from "@/components/ui/skeleton";
import { localeOptions, supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";

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
