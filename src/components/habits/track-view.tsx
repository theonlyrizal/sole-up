"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/result";
import {
  archiveHabit,
  pauseHabit,
  resumeHabit,
} from "@/server/modules/habits/actions";
import type {
  HabitListItem,
  TrackHabit,
  TrackView as TrackViewData,
} from "@/server/modules/habits/queries";

import { DeleteHabitDialog } from "./delete-habit-dialog";
import { HabitFormDialog, type HabitFormContext } from "./habit-form";
import { HabitStrip, HabitStripLegend } from "./habit-strip";

type StatusAction = {
  label: string;
  done: string;
  run: (input: { id: string }) => Promise<ActionResult<unknown>>;
};

const PAUSE: StatusAction = {
  label: "Pause",
  done: "Paused. Paused days don't count until you resume.",
  run: pauseHabit,
};
const RESUME: StatusAction = {
  label: "Resume",
  done: "Resumed",
  run: resumeHabit,
};
const ARCHIVE: StatusAction = {
  label: "Archive",
  done: "Archived. It's kept under Archived.",
  run: archiveHabit,
};

/**
 * Track: active habits, then paused ones, with their status actions and
 * their last two weeks, where past days are logged or corrected.
 */
export function TrackView({ view }: { view: TrackViewData }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const context: HabitFormContext = {
    goals: view.goals,
    today: view.today,
    weekStart: view.weekStart,
    thisWeekStartLabel: view.thisWeekStartLabel,
  };

  function changeStatus(habit: HabitListItem, action: StatusAction) {
    startTransition(async () => {
      setError(null);
      const result = await action.run({ id: habit.id });
      if (result.ok) toast({ title: action.done, variant: "success" });
      else setError(result.error.message);
    });
  }

  const newHabitButton = (
    <HabitFormDialog context={context} trigger={<Button>New habit</Button>} />
  );
  const active = view.habits.filter((habit) => habit.status === "active");
  const paused = view.habits.filter((habit) => habit.status === "paused");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {newHabitButton}
        <Link
          href="/track/archived"
          className={buttonClass({ variant: "ghost" })}
        >
          Archived
          <span className="text-muted tabular-nums">
            ({view.archivedCount})
          </span>
        </Link>
      </div>

      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>

      {view.habits.length === 0 ? (
        <EmptyState
          title="No habits yet"
          description="Pick something you want to do regularly, and how often. Habits are counted week by week, with no streaks to keep up."
          action={newHabitButton}
        />
      ) : (
        <>
          <HabitStripLegend />
          {active.length > 0 && (
            <HabitSection
              title="Active"
              habits={active}
              context={context}
              locale={view.locale}
              pending={pending}
              onChangeStatus={changeStatus}
            />
          )}
          {paused.length > 0 && (
            <HabitSection
              title="Paused"
              description="Paused days don't count. Resume a habit when you're ready."
              habits={paused}
              context={context}
              locale={view.locale}
              pending={pending}
              onChangeStatus={changeStatus}
            />
          )}
        </>
      )}
    </div>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  habits: TrackHabit[];
  context: HabitFormContext;
  locale: string;
  pending: boolean;
  onChangeStatus: (habit: HabitListItem, action: StatusAction) => void;
};

function HabitSection({
  title,
  description,
  habits,
  context,
  locale,
  pending,
  onChangeStatus,
}: SectionProps) {
  const headingId = `habits-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {habits.map((habit) => (
          <li key={habit.id} className="flex flex-col gap-3 p-4">
            <HabitSummary habit={habit} />
            <HabitStrip
              habit={habit}
              weekStart={context.weekStart}
              locale={locale}
            />
            <div className="flex flex-wrap items-center gap-1">
              {[habit.status === "paused" ? RESUME : PAUSE, ARCHIVE].map(
                (action) => (
                  <Button
                    key={action.label}
                    variant="secondary"
                    size="sm"
                    aria-label={`${action.label}: ${habit.title}`}
                    disabled={pending}
                    onClick={() => onChangeStatus(habit, action)}
                  >
                    {action.label}
                  </Button>
                ),
              )}
              <HabitFormDialog
                habit={habit}
                context={context}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit: ${habit.title}`}
                  >
                    Edit
                  </Button>
                }
              />
              <DeleteHabitDialog habit={habit} logCount={habit.logCount} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Title, schedule, target, goal and dates of one habit. */
export function HabitSummary({
  habit,
  headingLevel = 3,
}: {
  habit: HabitListItem;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const schedule = [habit.cadenceLabel, habit.targetLabel]
    .filter(Boolean)
    .join(" · ");
  const dates = [
    `From ${habit.startDateLabel}`,
    habit.endDateLabel && `until ${habit.endDateLabel}`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Heading className="font-medium break-words">{habit.title}</Heading>
      <p className="text-sm">{schedule}</p>
      {habit.description && (
        <p className="line-clamp-2 text-sm break-words whitespace-pre-line text-muted">
          {habit.description}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <span>{dates}</span>
        {habit.goal && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              Supports{" "}
              <Link
                href={`/goals/${habit.goal.id}`}
                className={cx("rounded-sm underline hover:text-fg", focusRing)}
              >
                {habit.goal.title}
              </Link>
            </span>
          </>
        )}
      </p>
    </div>
  );
}
