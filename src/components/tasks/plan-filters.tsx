"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useOptimistic, useTransition } from "react";

import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Select } from "@/components/ui/select";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/priorities";
import {
  DEFAULT_TASK_LIST_FILTERS,
  DUE_WINDOW_LABELS,
  hasActiveTaskFilters,
  PLANNED_WINDOW_LABELS,
  TASK_DATE_WINDOWS,
  TASK_SORT_LABELS,
  TASK_SORTS,
  TASK_STATUS_LABELS,
  type TaskListFilters,
  taskListSearch,
} from "@/lib/task-list";
import { TASK_STATUSES } from "@/lib/tasks";
import type { TaskFilterOptions } from "@/server/modules/tasks/queries";

type PlanFiltersProps = {
  filters: TaskListFilters;
  options: TaskFilterOptions;
};

const labelClass = "text-sm font-medium";
const selectClass = "py-1.5 text-sm";

/**
 * The Plan page's filters and sort. Every change navigates to the matching
 * URL, so a view can be bookmarked and survives a reload; the server reads
 * the filters back from it.
 */
export function PlanFilters({ filters, options }: PlanFiltersProps) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Shows the new choice at once while the filtered list loads.
  const [shown, setShown] = useOptimistic(filters);

  function change(next: Partial<TaskListFilters>) {
    const updated = { ...shown, ...next };
    startTransition(() => {
      setShown(updated);
      router.replace(`/plan${taskListSearch(updated)}`, { scroll: false });
    });
  }

  const selects: {
    key: string;
    label: string;
    value: string;
    choices: { value: string; label: string }[];
    onChange: (value: string) => void;
  }[] = [
    {
      key: "goal",
      label: "Goal",
      value: shown.goal ?? "",
      choices: [
        { value: "", label: "Any goal" },
        { value: "none", label: "No goal" },
        ...options.goals.map((goal) => ({
          value: goal.id,
          label:
            goal.status === "active"
              ? goal.title
              : `${goal.title} (${GOAL_STATUS_LABELS[goal.status].toLowerCase()})`,
        })),
      ],
      onChange: (value) => change({ goal: value || null }),
    },
    {
      key: "area",
      label: "Life area",
      value: shown.area ?? "",
      choices: [
        { value: "", label: "Any area" },
        ...options.areas.map((area) => ({
          value: area.id,
          label:
            area.status === "archived" ? `${area.name} (archived)` : area.name,
        })),
      ],
      onChange: (value) => change({ area: value || null }),
    },
    {
      key: "priority",
      label: "Priority",
      value: shown.priority ?? "",
      choices: [
        { value: "", label: "Any priority" },
        ...[...PRIORITIES].reverse().map((priority) => ({
          value: priority,
          label: PRIORITY_LABELS[priority],
        })),
        { value: "none", label: "No priority" },
      ],
      onChange: (value) =>
        change({
          priority: (value || null) as TaskListFilters["priority"],
        }),
    },
    {
      key: "planned",
      label: "Planned",
      value: shown.planned ?? "",
      choices: [
        { value: "", label: "Any time" },
        ...TASK_DATE_WINDOWS.map((window) => ({
          value: window,
          label: PLANNED_WINDOW_LABELS[window],
        })),
      ],
      onChange: (value) =>
        change({ planned: (value || null) as TaskListFilters["planned"] }),
    },
    {
      key: "due",
      label: "Due",
      value: shown.due ?? "",
      choices: [
        { value: "", label: "Any time" },
        ...TASK_DATE_WINDOWS.map((window) => ({
          value: window,
          label: DUE_WINDOW_LABELS[window],
        })),
      ],
      onChange: (value) =>
        change({ due: (value || null) as TaskListFilters["due"] }),
    },
    {
      key: "sort",
      label: "Sort by",
      value: shown.sort,
      choices: TASK_SORTS.map((sort) => ({
        value: sort,
        label: TASK_SORT_LABELS[sort],
      })),
      onChange: (value) => change({ sort: value as TaskListFilters["sort"] }),
    },
  ];

  if (shown.showClosed) {
    selects.push({
      key: "status",
      label: "Status",
      value: shown.status ?? "",
      choices: [
        { value: "", label: "Any status" },
        ...TASK_STATUSES.map((status) => ({
          value: status,
          label: TASK_STATUS_LABELS[status],
        })),
      ],
      onChange: (value) =>
        change({ status: (value || null) as TaskListFilters["status"] }),
    });
  }

  return (
    <section
      aria-label="Filter and sort tasks"
      aria-busy={pending || undefined}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {selects.map((select) => (
          <div key={select.key} className="flex flex-col gap-1">
            <label htmlFor={`${id}-${select.key}`} className={labelClass}>
              {select.label}
            </label>
            <Select
              id={`${id}-${select.key}`}
              className={selectClass}
              value={select.value}
              onChange={(event) => select.onChange(event.target.value)}
            >
              {select.choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shown.showClosed}
            onChange={(event) =>
              change({ showClosed: event.target.checked, status: null })
            }
            className={cx("size-4 shrink-0 accent-accent", focusRing)}
          />
          Show completed and cancelled
        </label>
        {(hasActiveTaskFilters(shown) ||
          shown.sort !== DEFAULT_TASK_LIST_FILTERS.sort ||
          shown.showClosed) && (
          <Link
            href="/plan"
            scroll={false}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            Clear filters
          </Link>
        )}
      </div>
    </section>
  );
}
