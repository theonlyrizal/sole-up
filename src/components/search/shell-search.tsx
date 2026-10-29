"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { cx, focusRing } from "@/components/ui/cx";
import { fieldClass } from "@/components/ui/field-styles";
import { SEARCH_QUERY_MAX } from "@/lib/search";

import { requestSearch } from "./search-handoff";

export const SEARCH_PATH = "/notes/search";

/**
 * Search in the shell (chunk 8.4): a field in the sidebar from `md` up, and
 * a "Search" link in the phone's top bar. Enter opens the search page and
 * hands it the terms in memory, never in the URL (ADR 0016). The link is
 * hidden from `md` up, where the field takes its place.
 */
export function ShellSearch() {
  const id = useId();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [query, setQuery] = useState("");
  return (
    <>
      <form
        role="search"
        aria-label="Quick search"
        className="hidden md:flex md:px-3"
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
        <input
          id={id}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Search"
          maxLength={SEARCH_QUERY_MAX}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={fieldClass()}
        />
      </form>
      <Link
        ref={linkRef}
        href={SEARCH_PATH}
        className={cx(
          "shrink-0 rounded-sm text-sm font-medium whitespace-nowrap text-muted hover:text-fg md:hidden",
          focusRing,
        )}
      >
        Search
      </Link>
    </>
  );
}
