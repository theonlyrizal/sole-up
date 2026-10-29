import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeView } from "@/components/home/home-view";
import { LoadingState } from "@/components/ui/skeleton";
import { todayClock } from "@/lib/today";
import { requireUser } from "@/server/auth/session";
import {
  deadlinesNextSevenDays,
  goalsWithoutNextAction,
  habitsSummary,
  listGoalsWithoutNextAction,
  nextCommitment,
  todayTaskCounts,
} from "@/server/modules/metrics/home";
import { getUserPreferences } from "@/server/modules/preferences/service";

export const metadata: Metadata = { title: "Home · SoleUp" };

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-muted">
          What matters now: what&apos;s next on your calendar, today, goals that
          need a next step, the week ahead, and how your habits are going.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading home" />}>
        <Home />
      </Suspense>
    </div>
  );
}

async function Home() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  // Every metric uses the user's today in their saved zone, at one instant.
  const clock = todayClock(timeZone);
  const [next, today, goals, goalList, deadlines, habits] = await Promise.all([
    nextCommitment(user.id, clock, timeZone),
    todayTaskCounts(user.id, clock, timeZone),
    goalsWithoutNextAction(user.id, clock, timeZone),
    listGoalsWithoutNextAction(user.id),
    deadlinesNextSevenDays(user.id, clock, timeZone),
    habitsSummary(user.id, clock, timeZone, preferences.weekStart),
  ]);
  return (
    <HomeView
      next={next}
      today={today}
      goals={goals}
      goalList={goalList}
      deadlines={deadlines}
      habits={habits}
      todayDate={clock.today}
      nextDayStartsAt={clock.dayEnd.toISOString()}
      locale={preferences.locale}
      timeZone={timeZone}
    />
  );
}
