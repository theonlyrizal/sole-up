"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { AreaChip } from "@/components/data/area-chip";
import { PageFrame } from "@/components/shell/page-frame";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { Button, buttonClass } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import {
  GOAL_LIST_STATUSES,
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  type GoalListStatus,
} from "@/lib/goals";
import type { LifeArea } from "@/lib/life-areas";
import type {
  GoalGroup,
  GoalsView as GoalsViewData,
} from "@/server/modules/goals/queries";

import { GoalActions } from "./goal-actions";
import { GoalFormDialog } from "./goal-form";
import { MilestoneArc } from "./milestone-arc";

const EMPTY_TITLES: Record<GoalListStatus, string> = {
  active: "No active goals",
  paused: "No paused goals",
  completed: "No completed goals",
  dropped: "No dropped goals",
};

function filterHref(status: GoalListStatus) {
  return status === "active" ? "/goals" : `/goals?status=${status}`;
}

function GoalsMenu({ archivedCount }: { archivedCount: number }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon="more_vert" label="Goals options" tooltip={false} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={() => router.push("/goals/areas")}>
          Life areas
        </MenuItem>
        <MenuItem
          onSelect={() => router.push("/goals/archived")}
          icon="archive"
        >
          Archived goals ({archivedCount})
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function GoalsView({ view }: { view: GoalsViewData }) {
  const router = useRouter();
  const newGoal = (
    <GoalFormDialog
      areas={view.areas}
      trigger={
        <Button size="xs" className="shrink-0">
          New goal
        </Button>
      }
      onSaved={() => {
        if (view.status !== "active") router.push(filterHref("active"));
      }}
    />
  );
  const options = <GoalsMenu archivedCount={view.archivedCount} />;
  return (
    <PageFrame
      title="Goals"
      compactActions={false}
      mobileHeader={<TopAppBar title="Goals" actions={options} />}
      actions={
        <>
          {newGoal}
          {options}
        </>
      }
      subnav={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ConnectedButtonGroup
            label="Filter goals by status"
            size="xs"
            compactLabels
            items={GOAL_LIST_STATUSES.map((status) => ({
              value: status,
              href: filterHref(status),
              label: `${GOAL_STATUS_LABELS[status]} (${view.counts[status]})`,
              className: "max-medium:px-1.5! max-medium:text-label-medium",
            }))}
            value={view.status}
          />
          <div className="medium:hidden">{newGoal}</div>
        </div>
      }
    >
      {view.groups.length === 0 ? (
        <EmptyState
          title={EMPTY_TITLES[view.status]}
          art={{ icon: "flag" }}
          description={
            view.status === "active"
              ? "Goals you set show here, grouped by life area."
              : undefined
          }
          action={
            view.status === "active" ? (
              newGoal
            ) : (
              <Link
                href={filterHref("active")}
                className={buttonClass({ variant: "tonal" })}
              >
                Back to Active
              </Link>
            )
          }
        />
      ) : (
        view.groups.map((group) => (
          <GoalGroupSection
            key={group.area?.id ?? "none"}
            group={group}
            areas={view.areas}
          />
        ))
      )}
    </PageFrame>
  );
}

function GoalGroupSection({
  group,
  areas,
}: {
  group: GoalGroup;
  areas: LifeArea[];
}) {
  const headingId = `goal-group-${group.area?.id ?? "none"}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId}>
        <AreaChip
          name={group.area?.name ?? "No area"}
          color={group.area?.color ?? null}
          archived={group.area?.status === "archived"}
        />
      </h2>
      <ul className="grid min-w-0 gap-3 expanded:grid-cols-2 expanded:gap-4 large:grid-cols-3">
        {group.goals.map((goal) => (
          <li key={goal.id} className="min-w-0">
            <Card
              as="article"
              className="state-layer flex h-full flex-col gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ShapeAvatar
                  id={goal.id}
                  entityType="goal"
                  label={goal.title}
                  area={group.area?.color}
                  size={40}
                />
                <h3 className="min-w-0 flex-1 text-title-medium wrap-anywhere">
                  <Link href={`/goals/${goal.id}`} className="stretched-link">
                    {goal.title}
                  </Link>
                </h3>
                <div className="relative z-10 max-w-1/3 self-start">
                  <GoalActions goal={goal} areas={areas} />
                </div>
              </div>
              {goal.reason && (
                <p className="line-clamp-2 text-body-medium wrap-anywhere whitespace-pre-line text-on-surface-variant">
                  {goal.reason}
                </p>
              )}
              <div className="mt-auto grid gap-2 empty:hidden">
                <MilestoneArc progress={goal.progress} size="mini" />
                <p className="flex flex-wrap gap-x-2 gap-y-1 text-body-small text-on-surface-variant empty:hidden">
                  {goal.startDateLabel && (
                    <span>Starts {goal.startDateLabel}</span>
                  )}
                  {goal.targetDateLabel && (
                    <span>Target {goal.targetDateLabel}</span>
                  )}
                  {goal.priority && (
                    <span>{GOAL_PRIORITY_LABELS[goal.priority]}</span>
                  )}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
