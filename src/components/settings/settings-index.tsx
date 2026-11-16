"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { ListGroup, ListItem } from "@/components/ui/list";
import { SearchBar } from "@/components/ui/search-bar";

export type SettingsIndexItem = {
  id: string;
  title: string;
  icon: IconName;
  keywords: string;
};

export function SettingsIndex({
  items,
  summaries,
}: {
  items: readonly SettingsIndexItem[];
  summaries: Record<string, ReactNode>;
}) {
  const [active, setActive] = useState<string>();
  const [search, setSearch] = useState("");
  const handledInitialHash = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter(({ title, keywords }) =>
    terms.every((term) => `${title.toLowerCase()} ${keywords}`.includes(term)),
  );

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
    <div className="grid min-w-0 gap-3">
      <div role="search" aria-label="Settings" className="grid gap-2">
        <label htmlFor="settings-search" className="text-label-large">
          Search settings
        </label>
        <SearchBar
          ref={input}
          id="settings-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => {
            setSearch("");
            input.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && search) {
              event.preventDefault();
              setSearch("");
            }
          }}
          aria-controls="settings-index"
        />
      </div>
      <nav
        aria-label="On this page"
        id="settings-index"
        className="grid min-w-0 gap-2"
      >
        <p className="text-label-large text-on-surface-variant" role="status">
          {terms.length
            ? matches.length
              ? `${matches.length} matching ${matches.length === 1 ? "section" : "sections"}`
              : "No matching settings. Try a different search."
            : "On this page"}
        </p>
        {matches.length > 0 && (
          <ListGroup label="Settings sections">
            {matches.map(({ id, title, icon }) => {
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
                  supporting={summaries[id]}
                  wrapSupporting
                  lines={1}
                  selected={selected}
                  current={selected ? "true" : undefined}
                />
              );
            })}
          </ListGroup>
        )}
      </nav>
    </div>
  );
}
