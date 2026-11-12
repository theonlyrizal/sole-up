import { WeekStrip } from "@/components/data/week-strip";
import { PageContainer } from "@/components/shell/page-container";
import type { WeekStart } from "@/lib/dates";
import type { ScheduleEntry } from "@/lib/schedule";
import type { TodayClock } from "@/lib/today";
import { weekDays } from "@/lib/week-strip";
import type {
  GoalWithoutNextAction,
  HabitSummaryItem,
  TodayTaskCounts,
} from "@/server/modules/metrics/home";
import type { Metric } from "@/server/modules/metrics/metric";
import { DeadlinesCard } from "./deadlines-card";
import { GoalsCard } from "./goals-card";
import { GreetingHeader, HomeAppBar, homeGreeting } from "./greeting";
import { HabitCarousel } from "./habit-carousel";
import { NextCommitmentCard } from "./next-commitment-card";
import { RefreshOnNewDay } from "./refresh-on-new-day";
import { TodayCard } from "./today-card";

type HomeViewProps = {
  next: Metric<ScheduleEntry | null>;
  today: Metric<TodayTaskCounts>;
  goals: Metric<number>;
  goalList: GoalWithoutNextAction[];
  deadlines: Metric<number>;
  habits: Metric<HabitSummaryItem[]>;
  account: { id: string; name: string };
  clock: TodayClock;
  locale: string;
  timeZone: string;
  weekStart: WeekStart;
};

export function HomeView({
  next,
  today,
  goals,
  goalList,
  deadlines,
  habits,
  account,
  clock,
  locale,
  timeZone,
  weekStart,
}: HomeViewProps) {
  const context = { todayDate: clock.today, locale };
  const greeting = homeGreeting(account.name, clock.now, timeZone, locale);
  const commitment = (
    <NextCommitmentCard metric={next} timeZone={timeZone} {...context} />
  );
  return (
    <div className="app-header-wash relative min-w-0">
      <RefreshOnNewDay nextDayStartsAt={clock.dayEnd.toISOString()} />
      <HomeAppBar {...greeting} account={account} />
      <PageContainer className="grid grid-cols-1 gap-2 max-medium:pt-1 medium:gap-6">
        <h1 className="sr-only">Home</h1>
        <GreetingHeader {...greeting} />
        <WeekStrip
          days={weekDays(clock.today, weekStart, locale)}
          today={clock.today}
        />
        <div className="grid min-w-0 gap-5 large:grid-cols-12 large:items-start large:gap-6">
          <div className="grid min-w-0 gap-4 large:col-span-8">
            {next.value && commitment}
            <TodayCard
              metric={today}
              feature={next.value === null}
              {...context}
            />
            {!next.value && commitment}
          </div>
          <div className="min-w-0 large:col-span-12 large:col-start-1 large:row-start-2">
            <HabitCarousel metric={habits} {...context} />
          </div>
          <div className="grid min-w-0 gap-4 large:col-span-4 large:col-start-9 large:row-start-1">
            <GoalsCard metric={goals} goalList={goalList} {...context} />
            <DeadlinesCard metric={deadlines} {...context} />
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
