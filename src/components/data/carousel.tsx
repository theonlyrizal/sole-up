"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";

export function Carousel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const [{ previous, next }, setEdges] = useState({
    previous: false,
    next: false,
  });

  useEffect(() => {
    const element = list.current!;
    function measure() {
      const previous = element.scrollLeft > 1;
      const next =
        element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((edges) =>
        edges.previous === previous && edges.next === next
          ? edges
          : { previous, next },
      );
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [children]);

  function move(direction: -1 | 1) {
    const element = list.current!;
    const [first, second] = Array.from(element.children) as HTMLElement[];
    if (first && second)
      element.scrollBy({
        left: direction * (second.offsetLeft - first.offsetLeft),
      });
  }

  return (
    <>
      <ul
        id={id}
        ref={list}
        aria-label={label}
        className="relative -mx-1 flex min-w-0 snap-x snap-mandatory scroll-ps-1 gap-2 overflow-x-auto scroll-smooth p-1 *:w-48 *:shrink-0 *:snap-start motion-reduce:scroll-auto expanded:mx-0 expanded:grid expanded:snap-none expanded:grid-cols-3 expanded:gap-4 expanded:overflow-visible expanded:p-0 expanded:*:w-auto large:grid-cols-4"
      >
        {children}
      </ul>
      {(previous || next) && (
        <div className="flex justify-end gap-1 expanded:hidden">
          <IconButton
            icon="chevron_left"
            label="Previous habits"
            aria-controls={id}
            aria-disabled={!previous}
            className="aria-disabled:opacity-50"
            onClick={() => previous && move(-1)}
          />
          <IconButton
            icon="chevron_right"
            label="Next habits"
            aria-controls={id}
            aria-disabled={!next}
            className="aria-disabled:opacity-50"
            onClick={() => next && move(1)}
          />
        </div>
      )}
    </>
  );
}
