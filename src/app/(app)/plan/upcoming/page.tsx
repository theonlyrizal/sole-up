import type { Metadata } from "next";
import { Suspense } from "react";

import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { UpcomingView } from "@/components/tasks/upcoming-view";
import { LoadingState } from "@/components/ui/skeleton";
import { todayFor } from "@/lib/dates";
import { parseUpcomingRange, upcomingWindow } from "@/lib/upcoming";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";
import { listUpcomingTasks } from "@/server/modules/tasks/queries";

export const metadata: Metadata = { title: "Upcoming · SoleUp" };

export default function UpcomingPage({
  searchParams,
}: PageProps<"/plan/upcoming">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Upcoming</h1>
        <p className="text-muted">
          What&apos;s planned or due in the days after today.
        </p>
      </div>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading upcoming days" />}>
        <Upcoming searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Upcoming({
  searchParams,
}: {
  searchParams: PageProps<"/plan/upcoming">["searchParams"];
}) {
  const user = await requireUser();
  const range = parseUpcomingRange((await searchParams).days);
  const preferences = await getUserPreferences(user.id);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  // Days are the user's dates in their saved zone, never the server's.
  const today = todayFor(timeZone);
  const window = upcomingWindow(today, range, timeZone);
  const days = await listUpcomingTasks(user.id, window, timeZone);
  return (
    <UpcomingView
      days={days}
      range={range}
      today={today}
      nextDayStartsAt={window.start.toISOString()}
      locale={preferences.locale}
      timeZone={timeZone}
    />
  );
}
