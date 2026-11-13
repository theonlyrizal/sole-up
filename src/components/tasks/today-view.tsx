"use client";

import { useId, useLayoutEffect, useRef, useState, useTransition } from "react";

import { BlockTimeDialog } from "@/components/calendar/block-form";
import { Timeline } from "@/components/data/timeline";
import { WeekStrip } from "@/components/data/week-strip";
import { TodayHabits } from "@/components/habits/today-habits";
import { useOpenQuickAdd } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup } from "@/components/ui/list";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import type { LocalDate } from "@/lib/dates";
import type { ActionResult } from "@/lib/result";
import type { ScheduleEntry } from "@/lib/schedule";
import { isInboxTask, type Task } from "@/lib/tasks";
import {
  plannedSummary,
  TODAY_SECTION_HINTS,
  TODAY_SECTION_LABELS,
  TODAY_SECTIONS,
  type TodaySection,
  todaySectionAnchor,
} from "@/lib/today";
import type { WeekStripDay } from "@/lib/week-strip";
import type { TodayHabits as TodayHabitsData } from "@/server/modules/habits/queries";
import { planTask, planTaskForDay } from "@/server/modules/tasks/actions";
import type {
  PlanTaskItem,
  TodaySuggestions,
  TodayTasks,
} from "@/server/modules/tasks/queries";

import { AddToToday } from "./add-to-today";
import { DeleteTaskDialog } from "./delete-task-dialog";
import { TaskFormDialog } from "./task-form";
import { TaskRow } from "./task-row";
import { TodayDateEditor } from "./today-date-editor";
import { useRefreshOnNewDay } from "./use-refresh-on-new-day";

type TodayViewProps = {
  today: LocalDate;
  dateLabel: string;
  week: WeekStripDay[];
  nextDayStartsAt: string;
  now: string;
  timeline: ScheduleEntry[];
  sections: TodayTasks;
  suggestions: TodaySuggestions;
  habits: TodayHabitsData;
  locale: string;
  timeZone: string;
};

type TaskOverlay = "plan" | "due" | "edit" | "block" | "delete";

export function TodayHeaderActions({
  tasks,
  locale,
  timeZone,
}: Pick<TodayViewProps, "locale" | "timeZone"> & {
  tasks: Pick<Task, "id" | "title" | "estimatedMinutes">[];
}) {
  const openQuickAdd = useOpenQuickAdd();
  return (
    <div className="hidden flex-wrap gap-2 large:flex">
      <Button icon="add" onClick={(event) => openQuickAdd(event.currentTarget)}>
        Add task
      </Button>
      <BlockTimeDialog
        tasks={tasks}
        locale={locale}
        timeZone={timeZone}
        trigger={
          <Button variant="tonal" icon="schedule">
            Block time
          </Button>
        }
      />
    </div>
  );
}

export function TodayView({
  today,
  dateLabel,
  week,
  nextDayStartsAt,
  now,
  timeline,
  sections,
  suggestions,
  habits,
  locale,
  timeZone,
}: TodayViewProps) {
  useRefreshOnNewDay(nextDayStartsAt);
  const taskPane = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<{
    kind: TaskOverlay;
    task: PlanTaskItem;
    trigger: HTMLElement;
  } | null>(null);
  const lastTaskFocus = useRef<{
    element: HTMLElement;
    row: HTMLElement;
    section: HTMLElement;
    index: number;
  } | null>(null);

  function restoreTaskFocus() {
    const last = lastTaskFocus.current;
    if (
      !last ||
      last.element.isConnected ||
      document.activeElement !== document.body
    )
      return;
    const title = last.row.querySelector<HTMLElement>("[data-today-task]");
    const moved = title?.dataset.todayTask;
    const titles = Array.from(
      taskPane.current?.querySelectorAll<HTMLElement>("[data-today-task]") ??
        [],
    );
    const sameTask = titles.find((item) => item.dataset.todayTask === moved);
    const remaining = titles.filter((item) => last.section.contains(item));
    const next = remaining[Math.min(last.index, remaining.length - 1)];
    const heading =
      taskPane.current?.querySelector<HTMLElement>("#today-planned h2");
    (sameTask ?? next ?? heading)?.focus();
  }

  useLayoutEffect(restoreTaskFocus, [sections]);

  function closeOverlayFocus(event: Event) {
    event.preventDefault();
    if (
      overlay?.trigger.isConnected &&
      overlay.trigger.getClientRects().length
    ) {
      overlay.trigger.focus({ preventScroll: true });
    } else {
      restoreTaskFocus();
    }
  }

  const overlayProps = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) setOverlay(null);
    },
    onCloseAutoFocus: closeOverlayFocus,
  };

  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid min-w-0 gap-3">
        <p className="text-headline-small medium:text-body-large medium:text-on-surface-variant">
          {dateLabel}
        </p>
        <div className="min-w-0 overflow-hidden large:hidden">
          <WeekStrip days={week} today={today} />
        </div>
      </div>
      <div className="grid min-w-0 gap-6 large:grid-cols-12 large:items-start">
        <div
          className="min-w-0 large:sticky large:top-4 large:col-span-5 large:col-start-8 large:row-start-1 large:max-h-[calc(100dvh-2rem)] large:overflow-y-auto large:overscroll-contain large:p-1"
          aria-label="Schedule and habits"
          role="region"
        >
          <div className="grid gap-6">
            <Timeline
              entries={timeline}
              today={today}
              now={new Date(now)}
              locale={locale}
              timeZone={timeZone}
            />
            <div className="hidden large:block">
              <TodayHabits data={habits} locale={locale} />
            </div>
          </div>
        </div>
        <div
          ref={taskPane}
          className="grid min-w-0 gap-6 large:col-span-7 large:col-start-1 large:row-start-1"
          onFocusCapture={(event) => {
            const element = event.target;
            const row = element.closest("li");
            const section = row?.closest("section");
            if (row && section) {
              lastTaskFocus.current = {
                element,
                row,
                section,
                index: Array.from(row.parentElement?.children ?? []).indexOf(
                  row,
                ),
              };
            } else if (taskPane.current?.contains(element)) {
              lastTaskFocus.current = null;
            }
          }}
        >
          {TODAY_SECTIONS.filter(
            (section) => section === "planned" || sections[section].length > 0,
          ).map((section) => (
            <TodaySectionBlock
              key={section}
              section={section}
              tasks={sections[section]}
              action={
                section === "planned" && (
                  <AddToToday
                    suggestions={suggestions}
                    locale={locale}
                    timeZone={timeZone}
                  />
                )
              }
              locale={locale}
              timeZone={timeZone}
              onOpen={(kind, task, trigger) =>
                setOverlay({ kind, task, trigger })
              }
            />
          ))}
        </div>
        <div className="large:hidden">
          <TodayHabits data={habits} locale={locale} />
        </div>
      </div>
      {overlay && (
        <>
          {(overlay.kind === "plan" || overlay.kind === "due") && (
            <ResponsiveSheet
              {...overlayProps}
              title={overlay.kind === "plan" ? "Pick a date" : "New due date"}
              description={overlay.task.title}
            >
              <TodayDateEditor
                task={overlay.task}
                kind={overlay.kind}
                locale={locale}
                timeZone={timeZone}
                inSheet
                onDone={() => setOverlay(null)}
              />
            </ResponsiveSheet>
          )}
          {overlay.kind === "edit" && (
            <TaskFormDialog {...overlayProps} task={overlay.task} />
          )}
          {overlay.kind === "block" && (
            <BlockTimeDialog
              {...overlayProps}
              task={overlay.task}
              locale={locale}
              timeZone={timeZone}
            />
          )}
          {overlay.kind === "delete" && (
            <DeleteTaskDialog
              {...overlayProps}
              task={overlay.task}
              noteLinkCount={null}
              onDeleted={() => setOverlay(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

type OpenTaskOverlay = (
  kind: TaskOverlay,
  task: PlanTaskItem,
  trigger: HTMLElement,
) => void;
type SectionProps = Pick<TodayViewProps, "locale" | "timeZone"> & {
  section: TodaySection;
  tasks: PlanTaskItem[];
  action: React.ReactNode;
  onOpen: OpenTaskOverlay;
};

function TodaySectionBlock({
  section,
  tasks,
  action,
  locale,
  timeZone,
  onOpen,
}: SectionProps) {
  const heading = useId();
  const label = TODAY_SECTION_LABELS[section];
  const hint =
    section === "planned" && tasks.length > 0
      ? plannedSummary(tasks)
      : TODAY_SECTION_HINTS[section];

  return (
    <section
      id={todaySectionAnchor(section)}
      aria-labelledby={heading}
      className="grid min-w-0 scroll-mt-20 gap-2 medium:scroll-mt-4"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2
            id={heading}
            tabIndex={-1}
            className="rounded-xs text-title-medium focus-visible:outline-3 focus-visible:outline-offset-2"
          >
            {label}
          </h2>
          <Badge count={tasks.length} />
        </div>
        {action}
      </div>
      <p className="text-body-medium text-on-surface-variant">{hint}</p>
      {tasks.length === 0 ? (
        <Card as="div">
          <EmptyState
            compact
            headingLevel={3}
            title="Nothing planned for today"
            description="Add a task when you’re ready, or leave the day open."
          />
        </Card>
      ) : (
        <ListGroup label={label}>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              locale={locale}
              timeZone={timeZone}
              onOpen={(trigger) => onOpen("edit", task, trigger)}
              actions={
                <TodayTaskActions
                  task={task}
                  section={section}
                  onOpen={onOpen}
                />
              }
            />
          ))}
        </ListGroup>
      )}
    </section>
  );
}

function TodayTaskActions({
  task,
  section,
  onOpen,
}: Pick<SectionProps, "section" | "onOpen"> & {
  task: PlanTaskItem;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menu = useRef<HTMLButtonElement>(null);
  const opening = useRef<{ kind: TaskOverlay; trigger: HTMLElement } | null>(
    null,
  );
  const isPlanned = section === "planned";
  const canUnplan = isPlanned || section === "earlier";
  const dateKind = canUnplan ? "plan" : "due";
  const dateLabel = canUnplan ? "Pick a date" : "New due date";

  function run(
    action: () => Promise<ActionResult<Task>>,
    message: (updated: Task) => string,
  ) {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await action();
        if (result.ok) {
          toast({ title: message(result.data), variant: "success" });
        } else {
          setError(result.error.message);
        }
      } catch {
        setError("Couldn't update the task. Try again.");
      }
    });
  }

  const planFor = (day: "today" | "tomorrow") =>
    run(
      () => planTaskForDay({ id: task.id, day }),
      () => (day === "today" ? "Planned for today" : "Moved to tomorrow"),
    );
  const unplan = () =>
    run(
      () => planTask({ id: task.id, plannedDate: null }),
      (updated) =>
        isInboxTask(updated) ? "Unplanned, now in your inbox" : "Unplanned",
    );
  function queueOverlay(kind: TaskOverlay) {
    if (menu.current) opening.current = { kind, trigger: menu.current };
  }

  return (
    <div className="grid justify-items-end">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <div className="hidden flex-wrap justify-end gap-1 medium:flex">
          {section === "decide" && (
            <>
              <Button
                variant="tonal"
                size="xs"
                aria-disabled={pending || undefined}
                aria-label={`Do today: ${task.title}`}
                onClick={() => planFor("today")}
              >
                Do today
              </Button>
              <Button
                variant="tonal"
                size="xs"
                aria-label={`New date: ${task.title}`}
                onClick={(event) => onOpen("due", task, event.currentTarget)}
              >
                New date
              </Button>
            </>
          )}
          {section === "earlier" && (
            <>
              <Button
                variant="tonal"
                size="xs"
                aria-disabled={pending || undefined}
                aria-label={`Plan for today: ${task.title}`}
                onClick={() => planFor("today")}
              >
                Today
              </Button>
              <Button
                variant="tonal"
                size="xs"
                aria-disabled={pending || undefined}
                aria-label={`Unplan: ${task.title}`}
                onClick={unplan}
              >
                Unplan
              </Button>
            </>
          )}
          {section === "planned" && (
            <>
              <Button
                variant="tonal"
                size="xs"
                aria-disabled={pending || undefined}
                aria-label={`Move to tomorrow: ${task.title}`}
                onClick={() => planFor("tomorrow")}
              >
                Tomorrow
              </Button>
              <Button
                variant="tonal"
                size="xs"
                aria-disabled={pending || undefined}
                aria-label={`Unplan: ${task.title}`}
                onClick={unplan}
              >
                Unplan
              </Button>
            </>
          )}
          {section === "due" && (
            <Button
              variant="tonal"
              size="xs"
              aria-disabled={pending || undefined}
              aria-label={`Plan for today: ${task.title}`}
              onClick={() => planFor("today")}
            >
              Today
            </Button>
          )}
        </div>
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              ref={menu}
              label={`Actions for ${task.title}`}
              icon="more_vert"
              tooltip={false}
              aria-busy={pending || undefined}
            />
          </MenuTrigger>
          <MenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!opening.current) return;
              const { kind, trigger } = opening.current;
              opening.current = null;
              event.preventDefault();
              // Keep a connected focus origin before the new overlay takes focus.
              trigger.focus({ preventScroll: true });
              onOpen(kind, task, trigger);
            }}
          >
            <MenuItem
              disabled={pending}
              icon="today"
              onSelect={() => planFor(isPlanned ? "tomorrow" : "today")}
            >
              {isPlanned ? "Tomorrow" : "Plan for today"}
            </MenuItem>
            <MenuItem
              disabled={pending}
              icon="event"
              onSelect={() => queueOverlay(dateKind)}
            >
              {dateLabel}
            </MenuItem>
            {canUnplan && (
              <MenuItem disabled={pending} onSelect={unplan}>
                Unplan
              </MenuItem>
            )}
            <MenuItem
              disabled={pending}
              icon="schedule"
              onSelect={() => queueOverlay("block")}
            >
              Block time
            </MenuItem>
            <MenuItem
              disabled={pending}
              icon="edit"
              onSelect={() => queueOverlay("edit")}
            >
              Edit task
            </MenuItem>
            <MenuItem
              disabled={pending}
              icon="delete"
              onSelect={() => queueOverlay("delete")}
            >
              Delete task
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {pending && (
        <span role="status" className="text-body-small text-on-surface-variant">
          Saving…
        </span>
      )}
      {error && (
        <p
          role="alert"
          className="max-w-40 text-end text-body-small text-on-surface-variant"
        >
          {error}
        </p>
      )}
    </div>
  );
}
