import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { InsightsView } from "@/components/reviews/insights-view";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { addDays, startOfWeek } from "@/lib/dates";
import { todayClock } from "@/lib/today";
import { requireUser } from "@/server/auth/session";
import {
  goalInactivityMetric,
  habitConsistencyTrendMetric,
  nextWeekWorkloadMetric,
  overdueTrendMetric,
} from "@/server/modules/metrics/insights";
import {
  plannedVersusCompletedMetric,
  reviewPeriod,
} from "@/server/modules/metrics/review";
import { getUserPreferences } from "@/server/modules/preferences/service";

export const metadata: Metadata = { title: "Insights · SoleUp" };

export default function InsightsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/review"
          className={cx(
            "self-start rounded-sm text-sm text-muted hover:text-fg",
            focusRing,
          )}
        >
          ← Weekly review
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-pretty text-muted">
          See how your plans, goals and habits have gone, and what you have
          coming up next week.
        </p>
      </header>
      <Suspense fallback={<LoadingState label="Loading insights" />}>
        <Insights />
      </Suspense>
    </div>
  );
}

async function Insights() {
  const user = await requireUser();
  const { timezone, weekStart, locale } = await getUserPreferences(user.id);
  const timeZone = timezone ?? "UTC";
  const clock = todayClock(timeZone);
  const context = { userId: user.id, clock, timeZone, weekStart };
  const lastWeek = addDays(startOfWeek(clock.today, weekStart), -7);
  const [planned, goals, overdue, habits, workload] = await Promise.all([
    plannedVersusCompletedMetric({
      ...context,
      period: reviewPeriod(lastWeek),
    }),
    goalInactivityMetric(context),
    overdueTrendMetric(context),
    habitConsistencyTrendMetric(context),
    nextWeekWorkloadMetric(context),
  ]);

  return (
    <InsightsView
      planned={planned}
      goals={goals}
      overdue={overdue}
      habits={habits}
      workload={workload}
      today={clock.today}
      locale={locale}
    />
  );
}
