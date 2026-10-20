import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PreferencesForm } from "@/components/preferences/preferences-form";
import { AppNav } from "@/components/shell/app-nav";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/toast";
import { localeOptions, supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";

/**
 * The authenticated area. Every page under (app) renders only for a signed-in
 * user; anyone else is redirected to /sign-in. Pages and actions must still
 * call requireUser() themselves: a layout is not an authorization boundary.
 *
 * The shell: a sidebar from `md` up, and on phones a top bar plus a bottom
 * navigation bar. The layout owns the page's `<main>`; pages render their
 * content without one.
 *
 * Until the user has confirmed a time zone, every page shows the
 * confirmation form instead of its content, and the navigation is hidden.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className={cx(
          "sr-only rounded-md bg-surface px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50",
          focusRing,
        )}
      >
        Skip to content
      </a>
      <Suspense
        fallback={
          <div className="px-4 py-10">
            <LoadingState />
          </div>
        }
      >
        <SignedInShell>{children}</SignedInShell>
      </Suspense>
      <Toaster />
    </>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  const confirmed = preferences.timezone !== null;
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:h-dvh md:w-56 md:shrink-0 md:flex-col md:items-stretch md:justify-start md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-5">
        <Link
          href="/home"
          className={cx("rounded-sm font-semibold md:px-3", focusRing)}
        >
          SoleUp
        </Link>
        {confirmed && <AppNav />}
        <div className="flex min-w-0 items-center gap-3 md:mt-auto md:flex-col md:items-start md:px-3">
          <span className="truncate text-sm text-muted">{user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col pb-20 focus:outline-none md:pb-0"
      >
        {confirmed ? (
          children
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Confirm your time zone
              </h1>
              <p className="text-muted">
                SoleUp works out what &ldquo;today&rdquo; is from your time
                zone. Check the suggestion below and change it if it&apos;s
                wrong. You can change these later in Settings.
              </p>
            </div>
            <PreferencesForm
              mode="confirm"
              initial={preferences}
              timeZones={supportedTimeZones()}
              locales={localeOptions(preferences.locale)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
