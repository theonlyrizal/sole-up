import "server-only";

import { addDays, todayFor } from "@/lib/dates";
import type { TimeBlockOccurrence } from "@/lib/time-blocks";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { blocksBetween } from "./service";

// Read models for the time-block UI (chunk 4.8). Every query is scoped to
// the user; the calendar's own feeds are in calendar-events/queries.ts.

/** How far ahead the task dialog looks for a task's blocks. */
export const TASK_BLOCKS_DAYS = 30;

/** A task's upcoming blocks, with how to show their times. */
export type TaskBlocks = {
  blocks: TimeBlockOccurrence[];
  /** The user's saved zone and locale. */
  timeZone: string;
  locale: string;
};

/**
 * The task's blocks and occurrences that haven't ended by `now`, from the
 * user's today through the next TASK_BLOCKS_DAYS days, in start order.
 * Another user's task (or a missing one) has none.
 */
export async function listTaskBlocks(
  userId: string,
  taskId: string,
  now: Date = new Date(),
): Promise<TaskBlocks> {
  const preferences = await getUserPreferences(userId);
  const timeZone = preferences.timezone ?? "UTC";
  const today = todayFor(timeZone, now);
  const blocks = await blocksBetween(
    userId,
    {
      localStart: today,
      localEnd: addDays(today, TASK_BLOCKS_DAYS + 1),
      tz: timeZone,
    },
    { taskId },
  );
  return {
    blocks: blocks.filter((block) => block.endAt > now),
    timeZone,
    locale: preferences.locale,
  };
}
