"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/** Watch a four-pixel sentinel at the start of the page. */
export function useScrolled() {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!sentinel) return () => {};
      const observer = new IntersectionObserver(onChange);
      observer.observe(sentinel);
      return () => observer.disconnect();
    },
    [sentinel],
  );
  const scrolled = useSyncExternalStore(
    subscribe,
    () => window.scrollY > 4,
    () => false,
  );
  return [scrolled, setSentinel] as const;
}
