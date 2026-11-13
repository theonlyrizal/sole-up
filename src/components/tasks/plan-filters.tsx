"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { RadioGroup, RadioRow } from "@/components/ui/radio-group";
import { GOAL_STATUS_LABELS } from "@/lib/goals";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/priorities";
import {
  DEFAULT_TASK_LIST_FILTERS,
  DUE_WINDOW_LABELS,
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

type FilterChoice = {
  key: Exclude<keyof TaskListFilters, "showClosed">;
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
};

/**
 * The Plan page's filters and sort. Every change navigates to the matching
 * URL, so a view can be bookmarked and survives a reload; the server reads
 * the filters back from it.
 */
export function PlanFilters({ filters, options }: PlanFiltersProps) {
  const bar = useRef<HTMLDivElement>(null);
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

  const selects: FilterChoice[] = [
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
      label: "Area",
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
      label: "Sort",
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

  const active = selects.filter(
    ({ key, value }) => value && value !== DEFAULT_TASK_LIST_FILTERS[key],
  );
  const canClear = active.length > 0 || shown.showClosed;

  function focusChip(key: string) {
    bar.current
      ?.querySelector<HTMLButtonElement>(`[data-filter="${key}"] button`)
      ?.focus();
  }

  return (
    <section
      aria-label="Filter and sort tasks"
      aria-busy={pending || undefined}
      className="grid min-w-0 gap-1"
    >
      <div
        ref={bar}
        className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-1 expanded:flex-wrap"
      >
        {selects.map((select) => (
          <div key={select.key} data-filter={select.key} className="shrink-0">
            <FilterSheet filter={select} selected={active.includes(select)} />
          </div>
        ))}
        <div className="shrink-0">
          <Chip
            type="filter"
            label="Show closed"
            selected={shown.showClosed}
            onClick={() =>
              change({ showClosed: !shown.showClosed, status: null })
            }
          />
        </div>
      </div>
      {canClear && (
        <div
          className="flex flex-wrap items-center gap-x-2"
          aria-label="Active filters"
          role="group"
        >
          {active.map((filter) => (
            <Chip
              key={filter.key}
              type="input"
              label={`${filter.label}: ${filter.choices.find((choice) => choice.value === filter.value)?.label ?? "Unavailable"}`}
              onRemove={() => {
                focusChip(filter.key);
                filter.onChange(
                  filter.key === "sort" ? DEFAULT_TASK_LIST_FILTERS.sort : "",
                );
              }}
            />
          ))}
          <Button
            variant="text"
            size="xs"
            onClick={() => {
              focusChip("goal");
              change(DEFAULT_TASK_LIST_FILTERS);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}

function FilterSheet({
  filter,
  selected,
}: {
  filter: FilterChoice;
  selected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filter.value);
  return (
    <ResponsiveSheet
      title={filter.label}
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(filter.value);
        setOpen(next);
      }}
      trigger={
        <Chip
          type="filter"
          selected={selected}
          label={filter.label}
          icon="expand_more"
        />
      }
    >
      <form
        className="grid min-w-0 gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setOpen(false);
          if (draft !== filter.value) filter.onChange(draft);
        }}
      >
        <RadioGroup label={filter.label} value={draft} onValueChange={setDraft}>
          {filter.choices.map(({ value, label }) => (
            <RadioRow key={value} value={value} label={label} />
          ))}
        </RadioGroup>
        <Button type="submit" className="justify-self-end">
          Apply
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
