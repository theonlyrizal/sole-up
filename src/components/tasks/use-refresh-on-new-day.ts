"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Reads the page again once the user's day has changed, so a page left open
 * overnight shows the new day. Only the view changes: no task is moved.
 * `nextDayStartsAt` is when the user's tomorrow begins (ISO instant).
 */
export function useRefreshOnNewDay(nextDayStartsAt: string) {
  const router = useRouter();
  useEffect(() => {
    const at = Date.parse(nextDayStartsAt);
    const refreshIfNewDay = () => {
      if (Date.now() >= at) router.refresh();
    };
    const timer = setTimeout(
      refreshIfNewDay,
      Math.max(0, at - Date.now()) + 1_000,
    );
    // Timers pause while a device sleeps; check again when the tab returns.
    document.addEventListener("visibilitychange", refreshIfNewDay);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshIfNewDay);
    };
  }, [nextDayStartsAt, router]);
}
