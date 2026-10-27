"use client";

import Link from "next/link";
import { useId, useOptimistic, useRef, useState, useTransition } from "react";

import { BlockTimeDialog } from "@/components/calendar/block-form";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  formatInstant,
  formatLocalDate,
  type LocalDate,
  localDateTimeOf,
} from "@/lib/dates";
import { PRIORITY_LABELS } from "@/lib/priorities";
import type { ActionResult } from "@/lib/result";
import { formatEstimate } from "@/lib/task-list";
import { isInboxTask, type Task, type TaskStatus } from "@/lib/tasks";
import {
  plannedSummary,
  TODAY_SECTION_HINTS,
  TODAY_SECTION_LABELS,
  TODAY_SECTIONS,
  type TodaySection,
  todaySectionAnchor,
} from "@/lib/today";
import {
  changeTaskStatus,
  planTask,
  planTaskForDay,
  rescheduleTaskDue,
} from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TodaySuggestions,
  TodayTasks,
} from "@/server/modules/tasks/queries";

import { AddToToday } from "./add-to-today";
import { useRefreshOnNewDay } from "./use-refresh-on-new-day";

type TodayViewProps = {
  /** The user's today, such as "Friday, 23 October 2026". */
  dateLabel: string;
  today: LocalDate;
  /** When the user's tomorrow begins (ISO instant). */
  nextDayStartsAt: string;
  sections: TodayTasks;
  suggestions: TodaySuggestions;
  locale: string;
  timeZone: string;
};

/**
 * Today (chunk 2.5): planned for today, due today, deadlines that need a
 * decision, and earlier plans not done. Each open task shows in one section
 * (see `todaySection`). Planned for today always shows; the others only
 * when they have tasks.
 */
export function TodayView({
  dateLabel,
  today,
  nextDayStartsAt,
  sections,
  suggestions,
  locale,
  timeZone,
}: TodayViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  return (
    <div className="flex flex-col gap-8">
      <p className="-mt-2 text-muted">{dateLabel}</p>
      {TODAY_SECTIONS.filter(
        (section) => section === "planned" || sections[section].length > 0,
      ).map((section) => (
        <TodaySectionBlock
          key={section}
          section={section}
          tasks={sections[section]}
          action={
            section === "planned" ? (
              <AddToToday
                suggestions={suggestions}
                locale={locale}
                timeZone={timeZone}
              />
            ) : null
          }
          today={today}
          locale={locale}
          timeZone={timeZone}
        />
      ))}
    </div>
  );
}

type RowContext = { today: LocalDate; locale: string; timeZone: string };

function TodaySectionBlock({
  section,
  tasks,
  action,
  ...context
}: RowContext & {
  section: TodaySection;
  tasks: PlanTaskItem[];
  action: React.ReactNode;
}) {
  const headingId = useId();
  const label = TODAY_SECTION_LABELS[section];
  const hint =
    section === "planned" && tasks.length > 0
      ? plannedSummary(tasks)
      : TODAY_SECTION_HINTS[section];
  return (
    <section
      id={todaySectionAnchor(section)}
      aria-labelledby={headingId}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-lg font-semibold">
            {label}
          </h2>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        {action}
      </div>
      {tasks.length === 0 ? (
        <EmptyState
          headingLevel={3}
          title="Nothing planned for today"
          description="That's fine. Add a few things from your goals if you'd like a plan, or leave the day open."
        />
      ) : (
        <ul
          aria-label={label}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {tasks.map((task) => (
            <TodayTaskRow
              key={task.id}
              task={task}
              section={section}
              {...context}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type Editing = "plan" | "due" | null;

function TodayTaskRow({
  task,
  section,
  today,
  locale,
  timeZone,
}: RowContext & { task: PlanTaskItem; section: TodaySection }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The checkbox follows the click at once, not after the refresh.
  const [status, setStatus] = useOptimistic(task.status);
  const pickButton = useRef<HTMLButtonElement>(null);

  function run(
    action: () => Promise<ActionResult<Task>>,
    message: (updated: Task) => string,
  ) {
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        toast({ title: message(result.data), variant: "success" });
      } else {
        setError(result.error.message);
      }
    });
  }

  function toggleComplete(checked: boolean) {
    const to: TaskStatus = checked ? "completed" : "open";
    startTransition(async () => {
      setError(null);
      setStatus(to);
      const result = await changeTaskStatus({ id: task.id, status: to });
      if (result.ok) {
        toast({
          title: to === "completed" ? "Task completed" : "Task reopened",
          variant: "success",
        });
      } else {
        setError(result.error.message);
      }
    });
  }

  const planToday = () =>
    run(
      () => planTaskForDay({ id: task.id, day: "today" }),
      () => "Planned for today",
    );
  const moveToTomorrow = () =>
    run(
      () => planTaskForDay({ id: task.id, day: "tomorrow" }),
      () => "Moved to tomorrow",
    );
  const unplan = () =>
    run(
      () => planTask({ id: task.id, plannedDate: null }),
      (updated) =>
        isInboxTask(updated) ? "Unplanned, now in your inbox" : "Unplanned",
    );

  function closeEditor() {
    setEditing(null);
    // The editor unmounts; put focus back where it came from.
    requestAnimationFrame(() => pickButton.current?.focus());
  }

  const editKind: Exclude<Editing, null> =
    section === "planned" || section === "earlier" ? "plan" : "due";
  const pickLabel = editKind === "plan" ? "Pick a date" : "New due date";
  const details = todayTaskDetails(task, today, locale, timeZone);

  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Complete: ${task.title}`}
          checked={status === "completed"}
          disabled={pending}
          onChange={(event) => toggleComplete(event.target.checked)}
          className={cx("mt-1 size-4 shrink-0 accent-accent", focusRing)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                "min-w-0 font-medium break-words",
                status !== "open" && "text-muted line-through",
              )}
            >
              {task.title}
            </span>
            {task.priority && (
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted">
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
          </div>
          {task.goal && (
            <p className="text-sm break-words text-muted">
              <Link
                href={`/goals/${task.goal.id}`}
                className={cx("rounded-sm hover:underline", focusRing)}
              >
                {task.goal.title}
              </Link>
              {task.milestone && <> › {task.milestone.title}</>}
            </p>
          )}
          {details.length > 0 && (
            <p className="text-sm text-muted">{details.join(" · ")}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-7">
        {section !== "planned" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-label={`Plan for today: ${task.title}`}
            onClick={planToday}
          >
            Plan for today
          </Button>
        )}
        {section === "planned" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            aria-label={`Move to tomorrow: ${task.title}`}
            onClick={moveToTomorrow}
          >
            Tomorrow
          </Button>
        )}
        <Button
          ref={pickButton}
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-expanded={editing !== null}
          aria-label={`${pickLabel}: ${task.title}`}
          onClick={() => (editing ? closeEditor() : setEditing(editKind))}
        >
          {pickLabel}
        </Button>
        {status === "open" && (
          <BlockTimeDialog
            task={task}
            timeZone={timeZone}
            locale={locale}
            trigger={
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                aria-label={`Block time: ${task.title}`}
              >
                Block time
              </Button>
            }
          />
        )}
        {(section === "planned" || section === "earlier") && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Unplan: ${task.title}`}
            onClick={unplan}
          >
            Unplan
          </Button>
        )}
      </div>
      <p role="alert" className="pl-7 text-sm text-danger empty:hidden">
        {error}
      </p>
      {editing && (
        <div className="pl-7">
          <TodayDateEditor
            task={task}
            kind={editing}
            locale={locale}
            timeZone={timeZone}
            onDone={closeEditor}
          />
        </div>
      )}
    </li>
  );
}

/** The planned date (unless it's today), deadline and estimate. */
function todayTaskDetails(
  task: PlanTaskItem,
  today: LocalDate,
  locale: string,
  timeZone: string,
): string[] {
  const details: string[] = [];
  if (task.plannedDate && task.plannedDate !== today) {
    details.push(`Planned ${formatLocalDate(task.plannedDate, locale)}`);
  }
  if (task.dueAt) {
    details.push(`Due ${formatInstant(task.dueAt, locale, timeZone)}`);
  } else if (task.dueDate) {
    details.push(`Due ${formatLocalDate(task.dueDate, locale)}`);
  }
  if (task.estimatedMinutes) {
    details.push(formatEstimate(task.estimatedMinutes));
  }
  return details;
}

/**
 * Picks a new planned date ("plan") or a new deadline ("due") for one task.
 * A timed deadline keeps its time of day in its own zone. Escape cancels.
 */
function TodayDateEditor({
  task,
  kind,
  locale,
  timeZone,
  onDone,
}: {
  task: PlanTaskItem;
  kind: "plan" | "due";
  locale: string;
  timeZone: string;
  onDone: () => void;
}) {
  const id = useId();
  const zone = task.dueTz ?? timeZone;
  const timedDue = task.dueAt ? localDateTimeOf(task.dueAt, zone) : null;
  const [date, setDate] = useState(
    kind === "plan"
      ? (task.plannedDate ?? "")
      : (timedDue?.date ?? task.dueDate ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!date) {
      setError("Pick a date.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result =
        kind === "plan"
          ? await planTask({ id: task.id, plannedDate: date })
          : await rescheduleTaskDue({
              id: task.id,
              dueDate: date,
              dueTime: timedDue?.time ?? "",
              dueTz: timedDue ? zone : "",
            });
      if (result.ok) {
        toast({
          title:
            kind === "plan"
              ? `Planned for ${formatLocalDate(date, locale)}`
              : `Now due ${formatLocalDate(date, locale)}`,
          variant: "success",
        });
        onDone();
      } else {
        const fieldErrors =
          result.error.code === "VALIDATION" ? result.error.fieldErrors : {};
        setError(
          [
            ...(fieldErrors.plannedDate ?? []),
            ...(fieldErrors.dueDate ?? []),
          ].join(" ") || result.error.message,
        );
      }
    });
  }

  const label = kind === "plan" ? "Plan for" : "New due date";
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`${label}: ${task.title}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onDone();
        }
      }}
      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-muted p-3"
    >
      <FormField
        id={`${id}-date`}
        label={label}
        hint={
          timedDue && kind === "due"
            ? `Keeps the time, ${timedDue.time} (${zone}).`
            : undefined
        }
        errors={error ? [error] : undefined}
      >
        {(control) => (
          <Input
            {...control}
            type="date"
            name="date"
            className="py-1.5 text-sm"
            value={date}
            autoFocus
            onChange={(event) => setDate(event.target.value)}
          />
        )}
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
