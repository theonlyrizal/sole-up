import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { localeOptions, supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";

/**
 * The authenticated area. Every page under (app) renders only for a signed-in
 * user; anyone else is redirected to /sign-in. Pages and actions must still
 * call requireUser() themselves: a layout is not an authorization boundary.
 *
 * Until the user has confirmed a time zone, every page shows the
 * confirmation form instead of its content.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <Link
          href="/home"
          className="rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          SoleUp
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{user.name}</span>
          {preferences.timezone !== null && (
            <Link
              href="/settings"
              className="rounded-sm text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Settings
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>
      {preferences.timezone === null ? (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Confirm your time zone
            </h1>
            <p className="text-muted">
              SoleUp works out what &ldquo;today&rdquo; is from your time zone.
              Check the suggestion below and change it if it&apos;s wrong. You
              can change these later in Settings.
            </p>
          </div>
          <PreferencesForm
            mode="confirm"
            initial={preferences}
            timeZones={supportedTimeZones()}
            locales={localeOptions(preferences.locale)}
          />
        </main>
      ) : (
        children
      )}
    </>
  );
}
