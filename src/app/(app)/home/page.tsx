import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeView } from "@/components/home/home-view";
import { PageFrame } from "@/components/shell/page-frame";
import { MoreSheet } from "@/components/shell/more-sheet";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { IconButton } from "@/components/ui/icon-button";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
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
    <PageFrame
      title="Home"
      description={
        "What matters now: what's next on your calendar, today, goals that need a next step, the week ahead, and how your habits are going."
      }
      wash
      mobileHeader={
        <Suspense fallback={<TopAppBar title="Home" />}>
          <HomeAppBar />
        </Suspense>
      }
    >
      <Suspense fallback={<LoadingState label="Loading home" />}>
        <Home />
      </Suspense>
    </PageFrame>
  );
}

async function HomeAppBar() {
  const user = await requireUser();
  const { timezone, locale } = await getUserPreferences(user.id);
  const timeZone = timezone ?? "UTC";
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <TopAppBar
      title={`${greeting}, ${user.name}`}
      greeting={{
        date: new Intl.DateTimeFormat(locale, {
          timeZone,
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(now),
        avatar: (
          <ShapeAvatar
            id={user.id}
            entityType="user"
            label={user.name}
            size={40}
          />
        ),
      }}
      actions={
        <MoreSheet
          account={{ id: user.id, name: user.name }}
          trigger={
            <IconButton
              label="More destinations"
              icon="more_horiz"
              tooltip={false}
            />
          }
        />
      }
    />
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
