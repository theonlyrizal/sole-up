import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/shell/page-container";
import { PageFrame } from "@/components/shell/page-frame";
import { PlanTaskList } from "@/components/tasks/plan-task-list";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/skeleton";
import { addDays } from "@/lib/dates";
import { formatDateSpan } from "@/lib/habits/track-range";
import { insightPeriodFromStart } from "@/lib/insights";
import { compareTasksBy } from "@/lib/task-list";
import { requireUser } from "@/server/auth/session";
import { taskInsightPeriodSchema } from "@/server/modules/insights/validation";
import { insightTaskIds } from "@/server/modules/metrics/insights";
import { getUserPreferences } from "@/server/modules/preferences/service";
import {
  listTaskItemsByIds,
  listTaskParentOptions,
} from "@/server/modules/tasks/queries";

export const metadata: Metadata = { title: "Insight tasks · SoleUp" };

const COPY = {
  planned_vs_completed: {
    title: "Tasks planned for the week",
    description:
      "Tasks that had a plan date in this week, including tasks that were later moved.",
  },
  overdue_trend: {
    title: "Tasks counted as overdue",
    description:
      "Tasks that were overdue at one or more of the four week endings. Each task appears once with its current details.",
  },
  next_week_workload: {
    title: "Tasks in next week’s workload",
    description:
      "Open tasks planned or due in this week. Update their dates or estimates here.",
  },
};

type InsightTaskPageProps = PageProps<"/review/insights/[insight]">;

export default function InsightTaskPage(props: InsightTaskPageProps) {
  return (
    <Suspense
      fallback={
        <PageContainer width="detail">
          <LoadingState label="Loading insight tasks" />
        </PageContainer>
      }
    >
      <InsightTasks {...props} />
    </Suspense>
  );
}

async function InsightTasks({ params, searchParams }: InsightTaskPageProps) {
  const user = await requireUser();
  const [{ insight }, { start }, preferences] = await Promise.all([
    params,
    searchParams,
    getUserPreferences(user.id),
  ]);
  const input = taskInsightPeriodSchema.safeParse({ key: insight, start });
  if (!input.success) notFound();

  const { key } = input.data;
  const period = insightPeriodFromStart(key, input.data.start);
  const { locale, timezone } = preferences;
  const timeZone = timezone ?? "UTC";
  const ids = insightTaskIds(user.id, key, period, timeZone);
  const [tasks, parentOptions] = await Promise.all([
    listTaskItemsByIds(user.id, ids),
    listTaskParentOptions(user.id),
  ]);
  const { title, description } = COPY[key];

  return (
    <PageFrame
      title={title}
      width="detail"
      back={{ href: "/review/insights", label: "Insights" }}
      description={description}
      eyebrow={formatDateSpan(
        { from: period.start, to: addDays(period.end, -1) },
        locale,
      )}
    >
      {tasks.length > 0 ? (
        <PlanTaskList
          tasks={tasks.sort(compareTasksBy("planned", timeZone))}
          parentOptions={parentOptions}
          timeZone={timeZone}
          locale={locale}
        />
      ) : (
        <EmptyState
          title="No tasks in this insight"
          description="There are no current task records matching this period."
        />
      )}
    </PageFrame>
  );
}
