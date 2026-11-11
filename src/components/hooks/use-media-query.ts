"use client";

import { useCallback, useSyncExternalStore } from "react";

import { type Breakpoint, mediaQuery } from "@/lib/breakpoints";

const serverSnapshot = () => null;

/** A window-size class or a full media query. Null until hydrated. */
export function useMediaQuery(
  query: Breakpoint | `(${string})`,
): boolean | null {
  const resolvedQuery = query.startsWith("(")
    ? query
    : mediaQuery(query as Breakpoint);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(resolvedQuery);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [resolvedQuery],
  );
  const snapshot = useCallback(
    () => window.matchMedia(resolvedQuery).matches,
    [resolvedQuery],
  );
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
