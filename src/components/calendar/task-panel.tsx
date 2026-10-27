"use client";

import { Draggable } from "@fullcalendar/react/interaction";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { defaultBlockMinutes } from "@/lib/block-form";
import { formatEstimate } from "@/lib/task-list";

import { type BlockableTask, BlockTimeDialog } from "./block-form";

/** The data attribute FullCalendar's `Draggable` finds rows by. */
export const TASK_DRAG_SELECTOR = "[data-task-drag]";

/** The task ID a dropped row carries. */
export function droppedTaskId(element: HTMLElement): string | undefined {
  return element.closest<HTMLElement>(TASK_DRAG_SELECTOR)?.dataset.taskId;
}

/**
 * The desktop task panel beside the Week grid (chunk 4.8): the user's open
 * tasks, each dragged onto the grid to block time for it at the drop
 * time, for its estimate (else 60 minutes). Each row's "Block time"
 * button is the keyboard path to the same thing.
 */
export function TaskPanel({
  tasks,
  timeZone,
  locale,
}: {
  tasks: BlockableTask[];
  timeZone: string;
  locale: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const hasTasks = tasks.length > 0;
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const draggable = new Draggable(list, {
      itemSelector: TASK_DRAG_SELECTOR,
      // FullCalendar shows the block's length while dragging; the page
      // creates the block itself, so FullCalendar adds no event.
      eventData: (element) => ({
        title: element.dataset.title ?? "",
        duration: { minutes: Number(element.dataset.minutes) },
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, [hasTasks]);

  return (
    <aside
      aria-labelledby="task-panel-heading"
      // Sticky, so it stays in reach while the long day grid scrolls.
      className="sticky top-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <h2 id="task-panel-heading" className="font-semibold">
        Open tasks
      </h2>
      <p className="text-sm text-muted">
        Drag a task onto the week to block time for it, or use Block time.
      </p>
      {!hasTasks ? (
        <p className="text-sm text-muted">No open tasks.</p>
      ) : (
        <ul
          ref={listRef}
          aria-label="Open tasks to block time for"
          className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto"
        >
          {tasks.map((task) => {
            const minutes = defaultBlockMinutes(task.estimatedMinutes);
            return (
              <li
                key={task.id}
                data-task-drag=""
                data-task-id={task.id}
                data-title={task.title}
                data-minutes={minutes}
                className="soleup-task-drag flex flex-col gap-1 rounded-md border border-border bg-bg p-2 text-sm"
              >
                <span className="font-medium break-words">{task.title}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-muted">{formatEstimate(minutes)}</span>
                  <BlockTimeDialog
                    task={task}
                    timeZone={timeZone}
                    locale={locale}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Block time: ${task.title}`}
                      >
                        Block time
                      </Button>
                    }
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
