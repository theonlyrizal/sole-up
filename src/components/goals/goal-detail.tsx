"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AreaChip } from "@/components/data/area-chip";
import { StatusChip } from "@/components/data/status-chip";
import { Icon } from "@/components/icons/icon";
import { LinkedNotesList } from "@/components/notes/linked-notes";
import { PageContainer } from "@/components/shell/page-container";
import { TopAppBar } from "@/components/shell/top-app-bar";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { IconButton } from "@/components/ui/icon-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { GOAL_PRIORITY_LABELS } from "@/lib/goals";
import {
  MILESTONE_PROGRESS_HELP,
  milestoneProgressLabel,
} from "@/lib/milestones";
import type { GoalHistoryEntry } from "@/server/modules/goals/history";
import type { GoalDetail } from "@/server/modules/goals/queries";

import { GoalActions } from "./goal-actions";
import { GoalNextAction, GoalTasks } from "./goal-tasks";
import { MilestoneArc, type MilestoneArcChange } from "./milestone-arc";
import { MilestoneList } from "./milestone-list";

export function GoalDetailView({
  detail,
  backHref,
}: {
  detail: GoalDetail;
  backHref: string;
}) {
  const {
    goal,
    area,
    areas,
    history,
    milestones,
    progress,
    tasks,
    nextAction,
    taskCounts,
    taskParentOptions,
    notes,
    noteLinkCount,
    locale,
    timeZone,
  } = detail;
  const router = useRouter();
  const addMilestoneId = useId();
  const newTaskId = useId();
  const [arcChange, setArcChange] = useState<MilestoneArcChange>();

  const areaChip = (
    <AreaChip
      name={area?.name ?? "No area"}
      color={area?.color ?? null}
      archived={area?.status === "archived"}
    />
  );
  const status = <StatusChip status={goal.status} />;
  const progressCard = (layout: "compact" | "expanded") => (
    <Card
      headingId={`goal-progress-${layout}`}
      className={`goal-progress min-w-0 gap-2 self-start ${layout === "compact" ? "grid expanded:hidden" : "hidden expanded:grid"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`goal-progress-${layout}`} className="text-title-medium">
          Progress
        </h2>
        <Popover>
          <PopoverTrigger asChild>
            <IconButton
              icon="info"
              label="How milestone progress is counted"
              tooltip={false}
            />
          </PopoverTrigger>
          <PopoverContent
            aria-label="Milestone progress definition"
            align="end"
          >
            <p className="text-body-medium">{MILESTONE_PROGRESS_HELP}</p>
          </PopoverContent>
        </Popover>
      </div>
      <p role="status" className="sr-only">
        {milestoneProgressLabel(progress)}
      </p>
      {progress?.countable ? (
        <MilestoneArc
          progress={progress}
          change={arcChange}
          onChangeAnimationEnd={() => setArcChange(undefined)}
        />
      ) : (
        <div className="grid justify-items-start gap-2">
          <p className="text-body-medium text-on-surface-variant">
            {milestones.length === 0
              ? "No milestones yet"
              : "No countable milestones"}
          </p>
          <Button
            variant="tonal"
            size="xs"
            onClick={() => document.getElementById(addMilestoneId)?.focus()}
          >
            Create milestone
          </Button>
        </div>
      )}
    </Card>
  );

  return (
    <div className="relative min-w-0">
      <TopAppBar title="Goal" back={{ href: backHref, label: "Goals" }} />
      <PageContainer className="grid gap-6">
        <header className="@container grid gap-3">
          <div className="hidden medium:block">
            <Link
              href={backHref}
              aria-label="← Goals"
              className={buttonClass({ variant: "text", icon: "arrow_back" })}
            >
              <Icon name="arrow_back" size={20} /> Goals
            </Link>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 @max-[17rem]:grid-cols-[minmax(0,1fr)_auto]">
            <ShapeAvatar
              id={goal.id}
              label={goal.title}
              entityType="goal"
              area={area?.color}
              size={56}
            />
            <div className="min-w-0 self-center @max-[17rem]:col-span-2 @max-[17rem]:row-start-2">
              <h1 className="text-headline-small wrap-anywhere medium:text-headline-medium">
                {goal.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {status}
                {areaChip}
                {goal.targetDateLabel && (
                  <span className="text-body-medium text-on-surface-variant">
                    Target {goal.targetDateLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="max-w-32 @max-[17rem]:col-start-2 @max-[17rem]:row-start-1">
              <GoalActions
                goal={goal}
                areas={areas}
                deletion={{
                  milestoneCount: milestones.length,
                  taskCounts,
                  noteLinkCount,
                  onDeleted: () => router.replace(backHref),
                }}
              />
            </div>
          </div>
        </header>

        <div className="grid min-w-0 content-start gap-5 expanded:grid-cols-12 expanded:gap-x-6">
          <Card
            variant={goal.reason ? "hero" : "default"}
            headingId="goal-why"
            className="grid gap-2 expanded:col-span-8"
          >
            <h2 id="goal-why" className="text-title-medium">
              Why this matters
            </h2>
            {goal.reason ? (
              <p className="max-w-prose text-body-large wrap-anywhere whitespace-pre-line">
                {goal.reason}
              </p>
            ) : (
              <p className="text-body-medium text-on-surface-variant">
                Add a reason when you edit this goal.
              </p>
            )}
          </Card>
          <GoalNextAction
            task={nextAction}
            hasOpenTasks={tasks.some((task) => task.status === "open")}
            parentOptions={taskParentOptions}
            locale={locale}
            timeZone={timeZone}
            addTaskId={newTaskId}
          />

          {progressCard("compact")}

          <section
            aria-labelledby="goal-milestones"
            className="grid min-w-0 gap-3 expanded:col-span-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="goal-milestones" className="text-title-large">
                Milestones
              </h2>
              {milestones.length > 0 && (
                <Button
                  variant="text"
                  size="xs"
                  onClick={() =>
                    document.getElementById(addMilestoneId)?.focus()
                  }
                >
                  Add milestone
                </Button>
              )}
            </div>
            <MilestoneList
              goalId={goal.id}
              goalStatus={goal.status}
              milestones={milestones}
              progress={progress}
              addInputId={addMilestoneId}
              onProgressChange={(before, after) =>
                setArcChange((current) => ({
                  revision: (current?.revision ?? 0) + 1,
                  before,
                  after,
                }))
              }
              onMutationStart={() => setArcChange(undefined)}
            />
          </section>

          <section
            aria-labelledby="goal-tasks"
            className="grid min-w-0 gap-3 expanded:col-span-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="goal-tasks" className="text-title-large">
                Tasks
              </h2>
              <Button
                variant="text"
                size="xs"
                onClick={() => document.getElementById(newTaskId)?.focus()}
              >
                Add task
              </Button>
            </div>
            <GoalTasks
              goalId={goal.id}
              milestones={milestones}
              tasks={tasks}
              parentOptions={taskParentOptions}
              locale={locale}
              timeZone={timeZone}
              addTaskId={newTaskId}
            />
          </section>

          <aside
            aria-label="Goal progress and details"
            className="contents expanded:sticky expanded:top-4 expanded:col-span-4 expanded:col-start-9 expanded:row-span-5 expanded:row-start-1 expanded:grid expanded:gap-4 expanded:self-start"
          >
            {progressCard("expanded")}
            <Card headingId="goal-details" className="grid min-w-0 gap-3">
              <h2 id="goal-details" className="text-title-medium">
                Details
              </h2>
              <dl className="grid gap-2 text-body-medium">
                <Detail label="Status">{status}</Detail>
                <Detail label="Life area">{areaChip}</Detail>
                {goal.startDateLabel && (
                  <Detail label="Starts">{goal.startDateLabel}</Detail>
                )}
                {goal.targetDateLabel && (
                  <Detail label="Target">{goal.targetDateLabel}</Detail>
                )}
                {goal.completedAtLabel && (
                  <Detail label="Completed on">{goal.completedAtLabel}</Detail>
                )}
                {goal.priority && (
                  <Detail label="Priority">
                    {GOAL_PRIORITY_LABELS[goal.priority]}
                  </Detail>
                )}
              </dl>
              {goal.description && (
                <p className="text-body-medium wrap-anywhere whitespace-pre-line text-on-surface-variant">
                  {goal.description}
                </p>
              )}
            </Card>
            <Card headingId="goal-notes" className="grid min-w-0 gap-3">
              <h2 id="goal-notes" className="text-title-medium">
                Notes
              </h2>
              <LinkedNotesList
                owner={{
                  targetType: "goal",
                  targetId: goal.id,
                  title: goal.title,
                }}
                notes={notes}
                onChanged={() => router.refresh()}
              />
            </Card>
          </aside>

          <Card headingId="goal-history" className="expanded:col-span-8">
            <h2 id="goal-history" className="sr-only">
              History
            </h2>
            <Disclosure title={`History (${history.length})`}>
              <GoalHistory history={history} />
            </Disclosure>
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

function GoalHistory({ history }: { history: GoalHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-on-surface-variant">No changes recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l border-outline-variant pl-4">
      {history.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{entry.summary}</span>
            <time
              dateTime={entry.occurredAt.toISOString()}
              className="text-body-medium text-on-surface-variant"
            >
              {entry.occurredAtLabel}
            </time>
          </div>
          {entry.details.length > 0 && (
            <ul className="text-body-medium text-on-surface-variant">
              {entry.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
