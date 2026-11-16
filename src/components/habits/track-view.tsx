"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { MetricInfo } from "@/components/data/metric-info";
import { PageFrame } from "@/components/shell/page-frame";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { Button, buttonClass } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { cx, focusRing } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import {
  trackHabitAnchor,
  trackHref,
  TRACK_RANGE_LABELS,
  type TrackRange,
} from "@/lib/habits/track-range";
import type {
  TrackHabit,
  TrackView as TrackViewData,
} from "@/server/modules/habits/queries";

import { HabitActions } from "./habit-actions";
import { HabitFormDialog, type HabitFormContext } from "./habit-form";
import { HabitStrip, HabitStripLegend } from "./habit-strip";

const ranges: TrackRange[] = ["week", "4w", "12w"];
const rangeItems = ranges.map((value) => ({
  value,
  label: TRACK_RANGE_LABELS[value],
  href: trackHref(value),
}));

export function TrackView({ view }: { view: TrackViewData }) {
  const router = useRouter();
  const [legendOpen, setLegendOpen] = useState(false);
  const openingLegend = useRef(false);
  const context: HabitFormContext = {
    goals: view.goals,
    today: view.today,
    weekStart: view.weekStart,
    thisWeekStartLabel: view.thisWeekStartLabel,
  };
  const newHabit = (
    <HabitFormDialog context={context} trigger={<Button>New habit</Button>} />
  );
  const archivedLabel = `Archived (${view.archivedCount})`;
  const active = view.habits.filter((habit) => habit.status === "active");
  const paused = view.habits.filter((habit) => habit.status === "paused");

  return (
    <PageFrame
      title="Track"
      actions={
        <>
          {view.habits.length > 0 && (
            <div className="hidden medium:block">{newHabit}</div>
          )}
          <Link
            href="/track/archived"
            className={buttonClass({
              variant: "text",
              className: "hidden medium:inline-flex",
            })}
          >
            {archivedLabel}
          </Link>
        </>
      }
      compactActions={false}
      mobileHeader={
        <TopAppBar
          title="Track"
          actions={
            <Menu modal={false}>
              <MenuTrigger asChild>
                <IconButton
                  icon="more_vert"
                  label="Track options"
                  tooltip={false}
                />
              </MenuTrigger>
              <MenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (!openingLegend.current) return;
                  openingLegend.current = false;
                  const trigger = document.querySelector<HTMLButtonElement>(
                    "#track-legend button",
                  );
                  if (trigger) {
                    event.preventDefault();
                    trigger.focus();
                  }
                }}
              >
                <MenuItem
                  icon="archive"
                  onSelect={() => router.push("/track/archived")}
                >
                  {archivedLabel}
                </MenuItem>
                {view.habits.length > 0 && (
                  <MenuItem
                    onSelect={() => {
                      openingLegend.current = true;
                      setLegendOpen(true);
                    }}
                  >
                    Legend
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          }
        />
      }
    >
      <div className="grid min-w-0 gap-6">
        {view.habits.length === 0 ? (
          <EmptyState
            art={{ icon: "check_circle" }}
            title="No habits yet"
            description="Pick something you want to do regularly, and choose how often."
            action={newHabit}
          />
        ) : (
          <>
            <div className="flex min-w-0 flex-col items-start gap-2">
              <ConnectedButtonGroup
                label="Range to show"
                items={rangeItems}
                value={view.range}
                compactLabels
              />
              <p className="text-body-medium text-on-surface-variant">
                {view.rangeDatesLabel}
              </p>
              <div className="flex flex-wrap items-start gap-2">
                <div className="medium:hidden">{newHabit}</div>
                <HabitStripLegend
                  open={legendOpen}
                  onOpenChange={setLegendOpen}
                />
              </div>
            </div>
            <HabitSection
              title="Active"
              habits={active}
              context={context}
              view={view}
            />
            <HabitSection
              title="Paused"
              habits={paused}
              context={context}
              view={view}
            />
          </>
        )}
      </div>
    </PageFrame>
  );
}

function HabitSection({
  title,
  habits,
  context,
  view,
}: {
  title: "Active" | "Paused";
  habits: TrackHabit[];
  context: HabitFormContext;
  view: TrackViewData;
}) {
  if (habits.length === 0) return null;
  const headingId = `habits-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-3">
      <h2 id={headingId} className="text-title-large">
        {title}
      </h2>
      <ul className="grid min-w-0 items-start gap-4 large:grid-cols-2">
        {habits.map((habit) => (
          <li
            key={habit.id}
            id={trackHabitAnchor(habit.id)}
            className="min-w-0 scroll-mt-20 medium:scroll-mt-4"
          >
            <HabitCard habit={habit} context={context} view={view} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HabitCard({
  habit,
  context,
  view,
}: {
  habit: TrackHabit;
  context: HabitFormContext;
  view: TrackViewData;
}) {
  const { figure, progressLabel, definition } = habit.history;
  return (
    <Card as="article" className="grid gap-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
        <ShapeAvatar
          id={habit.id}
          entityType="habit"
          label={habit.title}
          size={48}
        />
        <div className="min-w-0 self-center">
          <h3 className="text-title-medium wrap-anywhere">{habit.title}</h3>
          <p className="text-body-medium wrap-anywhere text-on-surface-variant">
            {habit.cadenceLabel}
            {habit.targetLabel && <> · {habit.targetLabel}</>}
          </p>
        </div>
        <HabitActions habit={habit} context={context} />
        {(habit.goal || habit.description) && (
          <div className="col-span-full grid gap-1 text-body-medium wrap-anywhere text-on-surface-variant">
            {habit.goal && (
              <Link
                href={`/goals/${habit.goal.id}`}
                className={cx(
                  "flex min-h-12 w-fit max-w-full items-center rounded-sm bg-surface-container px-3 text-label-large text-primary hover:underline",
                  focusRing,
                )}
              >
                {habit.goal.title}
              </Link>
            )}
            {habit.description && (
              <p className="whitespace-pre-line">{habit.description}</p>
            )}
          </div>
        )}
        <p className="col-span-full text-body-small text-on-surface-variant">
          From {habit.startDateLabel}
          {habit.endDateLabel && <> until {habit.endDateLabel}</>}
        </p>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-outline-variant pt-2">
        <div className="grid min-w-0 gap-1 wrap-anywhere">
          <p className="text-title-medium">{figure ?? progressLabel}</p>
          {figure !== null && progressLabel && (
            <p className="text-body-medium text-on-surface-variant">
              {progressLabel}
            </p>
          )}
        </div>
        <MetricInfo
          title={habit.title}
          definition={definition}
          range={view.rangeDatesLabel}
        />
      </div>
      <HabitStrip
        habit={habit}
        range={view.range}
        weekStart={view.weekStart}
        today={view.today}
        locale={view.locale}
      />
    </Card>
  );
}
