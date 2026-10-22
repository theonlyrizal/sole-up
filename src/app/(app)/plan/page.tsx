import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PlanFilters } from "@/components/tasks/plan-filters";
import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { PlanTaskList } from "@/components/tasks/plan-task-list";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/skeleton";
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-muted">
          Your open tasks. Filter them, change their dates and goals, and set
          priorities and estimates.
        </p>
      </div>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading your tasks" />}>
        <PlanTasks searchParams={searchParams} />
      </Suspense>
    </div>
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
      <p aria-live="polite" className="text-sm text-muted">
        {tasksLabel(tasks.length)}
      </p>
      {tasks.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No tasks match these filters"
            description="Try a wider date window, another goal, or clear the filters."
            action={
              <Link
                href="/plan"
                className={buttonClass({ variant: "secondary" })}
              >
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title={filters.showClosed ? "No tasks yet" : "No open tasks"}
            description="Press Q or use Add task to capture one. Tasks you add show up here."
          />
        )
      ) : (
        <PlanTaskList
          tasks={tasks}
          parentOptions={parentOptions}
          locale={preferences.locale}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}
