import type { Metadata } from "next";
import { Suspense } from "react";

import { PlanTabs } from "@/components/shell/plan-tabs";
import { TodayHeaderActions, TodayView } from "@/components/tasks/today-view";
import { PageFrame } from "@/components/shell/page-frame";
import { formatLocalDate } from "@/lib/dates";
import { todayClock } from "@/lib/today";
import { weekDays } from "@/lib/week-strip";
import { requireUser } from "@/server/auth/session";
import { listTodayTimeline } from "@/server/modules/calendar-events/queries";
import { getTodayHabits } from "@/server/modules/habits/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";
import {
  listTodaySuggestions,
  listTodayTasks,
} from "@/server/modules/tasks/queries";

import TodaySkeleton from "./loading";

export const metadata: Metadata = { title: "Today · SoleUp" };

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
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
  const dateLabel = formatLocalDate(clock.today, preferences.locale, "full");
  const blockable = Object.values(sections).flat();
  const tasks = [
    ...blockable,
    ...suggestions.dueSoon,
    ...suggestions.goals.flatMap((goal) => goal.tasks),
  ];
  return (
    <PageFrame
      title="Today"
      subnav={<PlanTabs />}
      actions={
        <TodayHeaderActions
          tasks={tasks.map(({ id, title, estimatedMinutes }) => ({
            id,
            title,
            estimatedMinutes,
          }))}
          locale={preferences.locale}
          timeZone={timeZone}
        />
      }
    >
      <TodayView
        today={clock.today}
        dateLabel={dateLabel}
        week={weekDays(clock.today, preferences.weekStart, preferences.locale)}
        nextDayStartsAt={clock.dayEnd.toISOString()}
        now={clock.now.toISOString()}
        timeline={timeline}
        sections={sections}
        suggestions={suggestions}
        habits={habits}
        locale={preferences.locale}
        timeZone={timeZone}
      />
    </PageFrame>
  );
}
