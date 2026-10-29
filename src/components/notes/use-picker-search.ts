"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ActionResult } from "@/lib/result";

/** How long a link picker waits after typing stops before it searches. */
export const PICKER_SEARCH_DELAY_MS = 250;

export const PICKER_UNREACHABLE =
  "Couldn't reach SoleUp. Check your connection, then try again.";

export type PickerSearch<T> =
  | { kind: "loading" }
  | { kind: "done"; data: T }
  | { kind: "error"; message: string };

/**
 * Runs a link picker's search (a Server Action, so the query stays out of
 * URLs and logs) as the query changes: at once for the first, empty query,
 * then after typing pauses. Only the latest search's result is kept.
 */
export function usePickerSearch<T>(
  query: string,
  search: (query: string) => Promise<ActionResult<T>>,
): PickerSearch<T> {
  const [state, setState] = useState<PickerSearch<T>>({ kind: "loading" });
  const searchRef = useRef(search);
  const firstRef = useRef(true);
  useLayoutEffect(() => {
    searchRef.current = search;
  });

  useEffect(() => {
    let cancelled = false;
    const delay = firstRef.current ? 0 : PICKER_SEARCH_DELAY_MS;
    firstRef.current = false;
    const timer = setTimeout(() => {
      searchRef.current(query.trim()).then(
        (result) => {
          if (cancelled) return;
          setState(
            result.ok
              ? { kind: "done", data: result.data }
              : { kind: "error", message: result.error.message },
          );
        },
        () => {
          if (!cancelled) {
            setState({ kind: "error", message: PICKER_UNREACHABLE });
          }
        },
      );
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return state;
}
