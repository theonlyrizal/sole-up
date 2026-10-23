"use client";

import { useRefreshOnNewDay } from "@/components/tasks/use-refresh-on-new-day";

/** Reads Home again when the user's next day begins. Renders nothing. */
export function RefreshOnNewDay({
  nextDayStartsAt,
}: {
  nextDayStartsAt: string;
}) {
  useRefreshOnNewDay(nextDayStartsAt);
  return null;
}
