"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Icon } from "@/components/icons/icon";
import { SEARCH_PATH } from "@/components/shell/nav-items";
import { focusRing } from "@/components/ui/cx";
import { SEARCH_QUERY_MAX } from "@/lib/search";

import { requestSearch } from "./search-handoff";

/**
 * The expanded rail hands search terms to the search page in memory (ADR 0016).
 */
export function ShellSearch() {
  const id = useId();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [query, setQuery] = useState("");
  return (
    <form
      role="search"
      aria-label="Quick search"
      className="relative min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (trimmed) requestSearch(trimmed);
        setQuery("");
        // Through the link, not router.push, so a note editor's guard
        // against leaving unsaved changes (use-note-autosave.ts) sees it.
        linkRef.current?.click();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Search notes, goals and tasks
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute inset-s-4 top-4 text-on-surface-variant"
      />
      <input
        id={id}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search"
        maxLength={SEARCH_QUERY_MAX}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={`h-14 w-full rounded-full bg-surface-container-highest ps-12 pe-4 text-body-large text-on-surface placeholder:text-on-surface-variant ${focusRing}`}
      />
      <Link ref={linkRef} href={SEARCH_PATH} hidden>
        Search
      </Link>
    </form>
  );
}
