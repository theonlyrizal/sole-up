import { Suspense } from "react";

import { PreferencesForm } from "@/components/preferences/preferences-form";
import { AppShell } from "@/components/shell/app-shell";
import { PageContainer } from "@/components/shell/page-container";
import { Card } from "@/components/ui/card";
import { cx, focusRing } from "@/components/ui/cx";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { LoadingState } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/toast";
import { localeOptions, supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";

/** Pages and actions still authenticate independently of the shared layout. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className={cx(
          "sr-only rounded-sm bg-resting-surface px-4 py-2 text-label-large text-on-resting-surface focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50",
          focusRing,
        )}
      >
        Skip to content
      </a>
      <Suspense
        fallback={
          <ShellMain>
            <PageContainer>
              <LoadingState />
            </PageContainer>
          </ShellMain>
        }
      >
        <SignedInShell>{children}</SignedInShell>
      </Suspense>
      <Toaster />
    </>
  );
}

function ShellMain({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="app-main min-w-0 flex-1 focus:outline-none"
    >
      {children}
    </main>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);

  if (preferences.timezone === null) {
    return (
      <ShellMain>
        <PageContainer width="reading" className="py-10">
          <Card className="mx-auto grid max-w-md gap-5">
            <ShapeAvatar
              id={user.id}
              entityType="user"
              label={user.name}
              size={48}
            />
            <div className="grid gap-2">
              <h1 className="text-headline-small">Confirm your time zone</h1>
              <p className="text-body-medium text-on-surface-variant">
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
          </Card>
        </PageContainer>
      </ShellMain>
    );
  }

  return (
    <AppShell account={{ id: user.id, name: user.name }}>
      <ShellMain>{children}</ShellMain>
    </AppShell>
  );
}
