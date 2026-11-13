import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PlanFilters } from "@/components/tasks/plan-filters";
import { PlanTabs } from "@/components/shell/plan-tabs";
import { PlanTaskList } from "@/components/tasks/plan-task-list";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { AddTaskButton } from "@/components/tasks/add-task-button";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { todayFor } from "@/lib/dates";
import { hasActiveTaskFilters, parseTaskListFilters } from "@/lib/task-list";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";
import {
  listPlanTasks,
  listTaskFilterOptions,
  listTaskParentOptions,
} from "@/server/modules/tasks/queries";

export const metadata: Metadata = { title: "Plan · SoleUp" };

export default function PlanPage({ searchParams }: PageProps<"/plan">) {
  return (
    <PageFrame
      title="All tasks"
      mobileHeader={<TopAppBar title="Plan" />}
      actions={<AddTaskButton />}
      compactActions={false}
      subnav={<PlanTabs />}
    >
      <Suspense fallback={<LoadingState label="Loading your tasks" />}>
        <PlanTasks searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

const tasksLabel = (count: number) =>
  `${count} ${count === 1 ? "task" : "tasks"}`;

async function PlanTasks({
  searchParams,
}: {
  searchParams: PageProps<"/plan">["searchParams"];
}) {
  const user = await requireUser();
  const filters = parseTaskListFilters(await searchParams);
  const preferences = await getUserPreferences(user.id);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  const [tasks, filterOptions, parentOptions] = await Promise.all([
    listPlanTasks(user.id, filters, { today: todayFor(timeZone), timeZone }),
    listTaskFilterOptions(user.id),
    listTaskParentOptions(user.id),
  ]);

  const filtered = hasActiveTaskFilters(filters);
  return (
    <div className="flex flex-col gap-4">
      <PlanFilters filters={filters} options={filterOptions} />
      <p
        id="plan-task-count"
        tabIndex={-1}
        aria-live="polite"
        className="text-body-medium text-on-surface-variant"
      >
        {tasksLabel(tasks.length)}
      </p>
      <PlanTaskList
        tasks={tasks}
        parentOptions={parentOptions}
        locale={preferences.locale}
        timeZone={timeZone}
        fallbackId="plan-task-count"
        empty={
          filtered ? (
            <EmptyState
              title="No tasks match these filters"
              description="Try a wider date window, another goal, or clear the filters."
              action={
                <Link
                  href="/plan"
                  scroll={false}
                  className={buttonClass({ variant: "tonal" })}
                >
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={filters.showClosed ? "No tasks yet" : "No open tasks"}
              description="Press Alt+Enter or use Add task to capture one. Tasks you add show up here."
            />
          )
        }
      />
    </div>
  );
}
