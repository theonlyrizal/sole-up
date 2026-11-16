"use client";

import { useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { ListGroup, ListItem } from "@/components/ui/list";

export type SettingsIndexItem = { id: string; title: string; icon: IconName };

export function SettingsIndex({
  items,
}: {
  items: readonly SettingsIndexItem[];
}) {
  const [active, setActive] = useState<string>();
  const handledInitialHash = useRef(false);

  useEffect(() => {
    const sections = items.flatMap(({ id }) => {
      const section = document.getElementById(id);
      return section ? [section] : [];
    });
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (isIntersecting) visible.add(target);
          else visible.delete(target);
        }
        const first = sections.find((section) => visible.has(section));
        setActive(first?.id);
      },
      { rootMargin: "-80px 0px -160px 0px" },
    );
    sections.forEach((section) => observer.observe(section));

    function restoreInitialAnchor() {
      if (handledInitialHash.current) return;
      handledInitialHash.current = true;
      const target = sections.find(
        (section) => `#${section.id}` === window.location.hash,
      );
      // The initial browser jump can happen before the streamed Settings
      // sections exist. Leave the native position alone if it did land.
      if (!target || window.scrollY > 4) return;
      const padding =
        parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingBlockStart,
        ) || 0;
      const margin =
        parseFloat(getComputedStyle(target).scrollMarginBlockStart) || 0;
      window.scrollTo({
        top:
          target.getBoundingClientRect().top +
          window.scrollY -
          padding -
          margin,
        behavior: "instant",
      });
    }

    if (document.readyState === "complete") restoreInitialAnchor();
    else window.addEventListener("load", restoreInitialAnchor, { once: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("load", restoreInitialAnchor);
    };
  }, [items]);

  return (
    <nav aria-label="On this page" className="grid min-w-0 gap-2">
      <p className="px-4 text-label-large text-on-surface-variant">
        On this page
      </p>
      <ListGroup label="Settings sections">
        {items.map(({ id, title, icon }) => {
          const selected = id === active;
          return (
            <ListItem
              key={id}
              href={`#${id}`}
              className="medium:max-expanded:px-2"
              headline={
                <span className="flex min-w-0 items-center gap-3 medium:max-expanded:gap-1">
                  <Icon
                    name={icon}
                    size={20}
                    filled={selected}
                    className="shrink-0 medium:max-expanded:hidden"
                  />
                  <span className="min-w-0 flex-1">{title}</span>
                  <Icon
                    name={selected ? "check" : "chevron_right"}
                    size={20}
                    className="shrink-0"
                  />
                </span>
              }
              selected={selected}
              current={selected ? "true" : undefined}
            />
          );
        })}
      </ListGroup>
    </nav>
  );
}
