import type { Metadata } from "next";
import { Suspense } from "react";

import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { TodayView } from "@/components/tasks/today-view";
import { LoadingState } from "@/components/ui/skeleton";
import { formatLocalDate } from "@/lib/dates";
import { todayClock } from "@/lib/today";
import { requireUser } from "@/server/auth/session";
import { listTodayTimeline } from "@/server/modules/calendar-events/queries";
import { getTodayHabits } from "@/server/modules/habits/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";
import {
  listTodaySuggestions,
  listTodayTasks,
} from "@/server/modules/tasks/queries";

export const metadata: Metadata = { title: "Today · SoleUp" };

export default function TodayPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading today" />}>
        <Today />
      </Suspense>
    </div>
  );
}

async function Today() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  // Today is the user's date in their saved zone, never the server's.
  const clock = todayClock(timeZone);
  const [timeline, sections, suggestions, habits] = await Promise.all([
    listTodayTimeline(user.id, clock, timeZone),
    listTodayTasks(user.id, clock, timeZone),
    listTodaySuggestions(user.id, clock, timeZone),
    getTodayHabits(user.id, clock.now),
  ]);
  return (
    <TodayView
      dateLabel={formatLocalDate(clock.today, preferences.locale, "full")}
      today={clock.today}
      nextDayStartsAt={clock.dayEnd.toISOString()}
      now={clock.now.toISOString()}
      timeline={timeline}
      sections={sections}
      suggestions={suggestions}
      habits={habits}
      locale={preferences.locale}
      timeZone={timeZone}
    />
  );
}
