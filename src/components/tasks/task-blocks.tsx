"use client";

import { useEffect, useId, useState } from "react";

import {
  type BlockableTask,
  BlockTimeDialog,
} from "@/components/calendar/block-form";
import { Button } from "@/components/ui/button";
import { blockStatusLabel } from "@/lib/block-form";
import { timeRangeLabel } from "@/lib/event-form";
import type { TaskStatus } from "@/lib/tasks";
import { getTaskBlocks } from "@/server/modules/time-blocks/actions";
import type { TaskBlocks as TaskBlocksData } from "@/server/modules/time-blocks/queries";

/**
 * The task dialog's "Time blocks" section (chunk 4.8): the task's blocks
 * that haven't ended in the next 30 days, and "Block time" for an open
 * task. Read when the dialog opens, and again after a block is added.
 */
export function TaskBlocks({
  task,
}: {
  task: BlockableTask & { status: TaskStatus };
}) {
  const headingId = useId();
  const [data, setData] = useState<TaskBlocksData | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped to read the blocks again (after "Block time").
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getTaskBlocks({ taskId: task.id }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [task.id, version]);

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-lg bg-resting-surface p-4 text-on-resting-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-title-medium">
          Time blocks
        </h3>
        {task.status === "open" && data && (
          <BlockTimeDialog
            task={task}
            timeZone={data.timeZone}
            locale={data.locale}
            onCreated={() => setVersion((count) => count + 1)}
            trigger={
              <Button
                variant="outlined"
                size="xs"
                aria-label={`Block time: ${task.title}`}
              >
                Block time
              </Button>
            }
          />
        )}
      </div>
      {failed ? (
        <p role="alert" className="text-body-medium text-error">
          Couldn&apos;t load the time blocks. Try reopening the task.
        </p>
      ) : !data ? (
        <p className="text-body-medium text-on-surface-variant">
          Loading time blocks…
        </p>
      ) : data.blocks.length === 0 ? (
        <p className="text-body-medium text-on-surface-variant">
          No upcoming time blocks.
        </p>
      ) : (
        <ul aria-label="Upcoming time blocks" className="flex flex-col gap-1">
          {data.blocks.map((block) => (
            <li
              key={`${block.id}:${block.originalStart?.toISOString() ?? ""}`}
              className="text-body-medium"
            >
              {timeRangeLabel(
                block.startAt,
                block.endAt,
                data.locale,
                data.timeZone,
                true,
              )}
              <span className="text-on-surface-variant">
                {` · ${blockStatusLabel(block, new Date())}`}
                {block.rrule ? " · Repeats" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
