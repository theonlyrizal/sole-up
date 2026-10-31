"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { noteTitle } from "@/components/notes/note-list";
import { TaskFormDialog } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TagSummary } from "@/lib/notes/tags";
import type { ActionError } from "@/lib/result";
import { SEARCH_QUERY_EMPTY, SEARCH_QUERY_MAX } from "@/lib/search";
import type { Task } from "@/lib/tasks";
import { search } from "@/server/modules/search/actions";
import type { SearchResults } from "@/server/modules/search/queries";

import { Highlighted } from "./highlighted";
import { onSearchRequested, takeRequestedSearch } from "./search-handoff";

const SEARCH_UNREACHABLE =
  "Couldn't reach SoleUp. Check your connection, then try again.";

export const NOTHING_TO_SEARCH =
  "There was nothing to search for: very common words such as “the” and “and” are left out. Try other words.";

type Found = Extract<SearchResults, { status: "results" }>;

/**
 * The search page (chunk 8.4): a field searching notes, goal titles and
 * task titles. Each search is a Server Action call, so the terms stay out
 * of the URL and the logs (ADR 0016). Results come in three groups with
 * their matches highlighted; a task opens its dialog, as tasks have no page.
 * The notes group can be narrowed to one tag (chunk 8.5), also sent only
 * as an action argument.
 */
export function SearchView({ tags = [] }: { tags?: TagSummary[] }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // The notes group's tag filter (chunk 8.5): an ID, sent with the query.
  const [tagId, setTagId] = useState("");
  const tagRef = useRef("");
  const [searched, setSearched] = useState<SearchResults | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);
  const lastQuery = useRef("");
  // The task whose dialog is showing, and the result button that opened it.
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  function run(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setSearched(null);
      setError({
        code: "VALIDATION",
        message: SEARCH_QUERY_EMPTY,
        fieldErrors: { query: [SEARCH_QUERY_EMPTY] },
        formErrors: [],
      });
      inputRef.current?.focus();
      return;
    }
    const call = ++latest.current;
    lastQuery.current = trimmed;
    startTransition(async () => {
      let result;
      try {
        const tag = tagRef.current;
        result = await search(
          tag ? { query: trimmed, tagId: tag } : { query: trimmed },
        );
      } catch {
        if (call !== latest.current) return;
        setError({ code: "INTERNAL", message: SEARCH_UNREACHABLE });
        return;
      }
      if (call !== latest.current) return;
      if (result.ok) {
        setError(null);
        setSearched(result.data);
      } else {
        setSearched(null);
        setError(result.error);
      }
    });
  }

  // A search typed into the shell's field (search-handoff.ts).
  useEffect(() => {
    function takeRequest() {
      const requested = takeRequestedSearch();
      if (requested === null) {
        inputRef.current?.focus();
        return;
      }
      setQuery(requested);
      run(requested);
    }
    takeRequest();
    return onSearchRequested(takeRequest);
  }, []);

  const fieldError =
    error?.code === "VALIDATION" ? error.fieldErrors.query?.[0] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <form
        role="search"
        aria-label="Notes, goals and tasks"
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(query);
        }}
      >
        <label htmlFor={`${id}-query`} className="text-sm font-medium">
          Search for
        </label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            id={`${id}-query`}
            type="search"
            name="query"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={SEARCH_QUERY_MAX}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ""}`}
            aria-invalid={fieldError ? true : undefined}
            className="min-w-0 flex-1"
          />
          <Button type="submit">Search</Button>
        </div>
        <p id={`${id}-hint`} className="text-sm text-muted">
          Finds words in any form: “run” finds “running”. Use quotes for a
          phrase, and a minus sign to leave a word out.
        </p>
        {fieldError && (
          <p id={`${id}-error`} role="alert" className="text-sm text-danger">
            {fieldError}
          </p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-tag`} className="text-sm font-medium">
              Notes with tag
            </label>
            <Select
              id={`${id}-tag`}
              value={tagId}
              onChange={(event) => {
                setTagId(event.target.value);
                tagRef.current = event.target.value;
                // Search again with the new filter, once there is a search.
                if (lastQuery.current) run(lastQuery.current);
              }}
              className="max-w-xs"
            >
              <option value="">Any tag</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {error?.code !== "VALIDATION" && <FormError error={error} />}
      </form>

      <p role="status" className="text-sm text-muted empty:hidden">
        {pending
          ? "Searching…"
          : searched?.status === "results"
            ? resultSummary(searched)
            : ""}
      </p>

      {searched?.status === "nothing_to_search" && (
        <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-muted">
          {NOTHING_TO_SEARCH}
        </p>
      )}
      {searched?.status === "results" && (
        <Results
          found={searched}
          tagged={tagId !== ""}
          onOpenTask={(task, button) => {
            opener.current = button;
            setOpenTask(task);
            setTaskDialogOpen(true);
          }}
        />
      )}

      {openTask && (
        <TaskFormDialog
          task={openTask}
          open={taskDialogOpen}
          onOpenChange={(open) => {
            setTaskDialogOpen(open);
            // The task may have changed or gone: search again.
            if (!open && lastQuery.current) run(lastQuery.current);
          }}
          onCloseAutoFocus={(event) => {
            // Back to the result, or to the field if the task is gone.
            event.preventDefault();
            const target = opener.current?.isConnected
              ? opener.current
              : inputRef.current;
            target?.focus();
            setOpenTask(null);
          }}
        />
      )}
    </div>
  );
}

function resultSummary(found: Found): string {
  const total = found.notes.length + found.goals.length + found.tasks.length;
  if (total === 0) return "Nothing matched.";
  const counts = [
    count(found.notes.length, "note"),
    count(found.goals.length, "goal"),
    count(found.tasks.length, "task"),
  ];
  return `Found ${counts.join(", ")}.`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const resultLink = cx(
  "rounded-sm font-medium break-words hover:underline",
  focusRing,
);

function Results({
  found,
  tagged,
  onOpenTask,
}: {
  found: Found;
  /** The notes group is filtered by a tag. */
  tagged: boolean;
  onOpenTask: (task: Task, button: HTMLElement) => void;
}) {
  if (
    found.notes.length === 0 &&
    found.goals.length === 0 &&
    found.tasks.length === 0
  ) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">No matches</h2>
        <p className="text-muted">
          Nothing in your notes, goals or tasks matched. Archived notes
          aren&apos;t searched.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <ResultGroup
        title="Notes"
        empty={tagged ? "No notes with this tag matched." : "No notes matched."}
        count={found.notes.length}
      >
        {found.notes.map((hit) => (
          <li key={hit.id} className="flex min-w-0 flex-col gap-1 p-4">
            <h3>
              <Link href={`/notes/${hit.id}`} className={resultLink}>
                {hit.titleHighlight === null ? (
                  noteTitle(null)
                ) : (
                  <Highlighted text={hit.titleHighlight} />
                )}
              </Link>
            </h3>
            {hit.excerptHighlight && (
              <p className="text-sm break-words text-muted">
                <Highlighted text={hit.excerptHighlight} />
              </p>
            )}
            <p className="text-xs text-muted">Updated {hit.updatedLabel}</p>
          </li>
        ))}
      </ResultGroup>
      <ResultGroup
        title="Goals"
        empty="No goals matched."
        count={found.goals.length}
      >
        {found.goals.map((hit) => (
          <li
            key={hit.id}
            className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-4"
          >
            <h3 className="min-w-0">
              <Link href={`/goals/${hit.id}`} className={resultLink}>
                <Highlighted text={hit.titleHighlight} />
              </Link>
            </h3>
            <span className="text-sm text-muted">{hit.statusLabel}</span>
          </li>
        ))}
      </ResultGroup>
      <ResultGroup
        title="Tasks"
        empty="No tasks matched."
        count={found.tasks.length}
      >
        {found.tasks.map((hit) => (
          <li
            key={hit.task.id}
            className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-4"
          >
            <h3 className="min-w-0">
              <button
                type="button"
                onClick={(event) => onOpenTask(hit.task, event.currentTarget)}
                aria-haspopup="dialog"
                className={cx(resultLink, "text-left")}
              >
                <Highlighted text={hit.titleHighlight} />
              </button>
            </h3>
            <span className="text-sm text-muted">{hit.statusLabel}</span>
          </li>
        ))}
      </ResultGroup>
    </div>
  );
}

function ResultGroup({
  title,
  empty,
  count: total,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {total === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul
          aria-label={title}
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {children}
        </ul>
      )}
    </section>
  );
}
