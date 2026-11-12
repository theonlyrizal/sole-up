import type { Metadata } from "next";

import { HomeView } from "@/components/home/home-view";
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

export default async function HomePage() {
  const user = await requireUser();
  const { timezone, locale, weekStart } = await getUserPreferences(user.id);
  // Every metric uses the user's today in their saved zone, at one instant.
  const timeZone = timezone ?? "UTC";
  const clock = todayClock(timeZone);
  const [next, today, goals, goalList, deadlines, habits] = await Promise.all([
    nextCommitment(user.id, clock, timeZone),
    todayTaskCounts(user.id, clock, timeZone),
    goalsWithoutNextAction(user.id, clock, timeZone),
    listGoalsWithoutNextAction(user.id),
    deadlinesNextSevenDays(user.id, clock, timeZone),
    habitsSummary(user.id, clock, timeZone, weekStart),
  ]);

  return (
    <HomeView
      next={next}
      today={today}
      goals={goals}
      goalList={goalList}
      deadlines={deadlines}
      habits={habits}
      account={{ id: user.id, name: user.name }}
      clock={clock}
      locale={locale}
      timeZone={timeZone}
      weekStart={weekStart}
    />
  );
}
