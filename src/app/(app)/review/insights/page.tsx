import type { Metadata } from "next";
import { Suspense } from "react";

import { InsightsView } from "@/components/reviews/insights-view";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { insightPeriod } from "@/lib/insights";
import { todayClock } from "@/lib/today";
import { requireUser } from "@/server/auth/session";
import { dismissedInsightKeys } from "@/server/modules/insights/service";
import {
  goalInactivityMetric,
  habitConsistencyTrendMetric,
  nextWeekWorkloadMetric,
  overdueTrendMetric,
} from "@/server/modules/metrics/insights";
import { plannedVersusCompletedMetric } from "@/server/modules/metrics/review";
import { getUserPreferences } from "@/server/modules/preferences/service";

export const metadata: Metadata = { title: "Insights · SoleUp" };

export default function InsightsPage() {
  return (
    <PageFrame
      title="Insights"
      back={{ href: "/review", label: "Weekly review" }}
      description={
        "See how your plans, goals and habits have gone, and what you have coming up next week."
      }
    >
      <Suspense fallback={<LoadingState label="Loading insights" />}>
        <Insights />
      </Suspense>
    </PageFrame>
  );
}

async function Insights() {
  const user = await requireUser();
  const { timezone, weekStart, locale } = await getUserPreferences(user.id);
  const timeZone = timezone ?? "UTC";
  const clock = todayClock(timeZone);
  const context = { userId: user.id, clock, timeZone, weekStart };
  const [planned, goals, overdue, habits, workload, dismissed] =
    await Promise.all([
      plannedVersusCompletedMetric({
        ...context,
        period: insightPeriod("planned_vs_completed", clock.today, weekStart),
      }),
      goalInactivityMetric(context),
      overdueTrendMetric(context),
      habitConsistencyTrendMetric(context),
      nextWeekWorkloadMetric(context),
      dismissedInsightKeys(user.id, clock.today, weekStart),
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
      weekStart={weekStart}
      dismissed={dismissed}
    />
  );
}
