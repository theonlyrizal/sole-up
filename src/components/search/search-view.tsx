"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Icon } from "@/components/icons/icon";
import { TaskFormDialog } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItem } from "@/components/ui/list";
import { FormError } from "@/components/ui/form-error";
import { SearchBar } from "@/components/ui/search-bar";
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
export function SearchView({
  tags = [],
  timeZone,
}: {
  tags?: TagSummary[];
  timeZone: string;
}) {
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
      ++latest.current;
      lastQuery.current = "";
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
      inputRef.current?.focus();
      if (requested === null) return;
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
        method="post"
        role="search"
        aria-label="Notes, goals and tasks"
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(query);
        }}
      >
        <label htmlFor={`${id}-query`} className="sr-only">
          Search for
        </label>
        <div className="flex items-center gap-2">
          <SearchBar
            ref={inputRef}
            id={`${id}-query`}
            placeholder="Search notes, goals and tasks"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={SEARCH_QUERY_MAX}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => {
              ++latest.current;
              lastQuery.current = "";
              setQuery("");
              setSearched(null);
              setError(null);
              inputRef.current?.focus();
            }}
            aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ""}`}
            aria-invalid={fieldError ? true : undefined}
          />
          <Button type="submit">Search</Button>
        </div>
        <p
          id={`${id}-hint`}
          className="text-body-medium text-on-surface-variant"
        >
          Finds words in any form: “run” finds “running”. Use quotes for a
          phrase, and a minus sign to leave a word out.
        </p>
        {fieldError && (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-body-medium text-error"
          >
            {fieldError}
          </p>
        )}
        {tags.length > 0 && (
          <div className="flex max-w-xs flex-col gap-1.5">
            <label htmlFor={`${id}-tag`} className="text-label-large">
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

      <p
        role="status"
        className="text-body-medium text-on-surface-variant empty:hidden"
      >
        {pending
          ? "Searching…"
          : searched?.status === "results"
            ? resultSummary(searched)
            : ""}
      </p>

      {searched?.status === "nothing_to_search" && (
        <p className="rounded-lg bg-resting-surface p-5 text-on-resting-surface">
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
          timeZone={timeZone}
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

function Results({
  found,
  tagged,
  onOpenTask,
}: {
  found: Found;
  tagged: boolean;
  onOpenTask: (task: Task, button: HTMLElement) => void;
}) {
  if (!found.notes.length && !found.goals.length && !found.tasks.length) {
    return (
      <EmptyState
        title="No matches"
        description="Nothing in your notes, goals or tasks matched. Archived notes aren't searched."
        className="rounded-lg bg-resting-surface"
      />
    );
  }
  return (
    <div className="grid min-w-0 gap-6">
      <ResultGroup
        title="Notes"
        empty={tagged ? "No notes with this tag matched." : "No notes matched."}
        count={found.notes.length}
      >
        {found.notes.map((hit) => (
          <ListItem
            key={hit.id}
            href={`/notes/${hit.id}`}
            leading={<ResultIcon name="sticky_note_2" />}
            headline={
              hit.titleHighlight === null ? (
                <span className="text-on-surface-variant italic">Untitled</span>
              ) : (
                <Highlighted text={hit.titleHighlight} />
              )
            }
            supporting={
              <>
                {hit.excerptHighlight && (
                  <p>
                    <Highlighted text={hit.excerptHighlight} />
                  </p>
                )}
                <p className="mt-1 text-label-medium">
                  Updated {hit.updatedLabel}
                </p>
              </>
            }
            wrapSupporting
          />
        ))}
      </ResultGroup>
      <ResultGroup
        title="Goals"
        empty="No goals matched."
        count={found.goals.length}
      >
        {found.goals.map((hit) => (
          <ListItem
            key={hit.id}
            href={`/goals/${hit.id}`}
            leading={<ResultIcon name="flag" />}
            headline={<Highlighted text={hit.titleHighlight} />}
            meta={<Chip type="status" label={hit.statusLabel} />}
          />
        ))}
      </ResultGroup>
      <ResultGroup
        title="Tasks"
        empty="No tasks matched."
        count={found.tasks.length}
      >
        {found.tasks.map((hit) => (
          <ListItem
            key={hit.task.id}
            onClick={(event) => onOpenTask(hit.task, event.currentTarget)}
            popup="dialog"
            leading={<ResultIcon name="checklist" />}
            headline={<Highlighted text={hit.titleHighlight} />}
            meta={<Chip type="status" label={hit.statusLabel} />}
          />
        ))}
      </ResultGroup>
    </div>
  );
}

function ResultIcon({
  name,
}: {
  name: "sticky_note_2" | "flag" | "checklist";
}) {
  return <Icon name={name} size={20} className="text-on-surface-variant" />;
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
    <section aria-labelledby={id} className="grid min-w-0 gap-2">
      <div className="flex items-center gap-2">
        <h2 id={id} className="text-title-medium">
          {title}
        </h2>
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-medium text-on-surface-variant">
          {total}
        </span>
      </div>
      {total === 0 ? (
        <p className="text-body-medium text-on-surface-variant">{empty}</p>
      ) : (
        <ListGroup label={title}>{children}</ListGroup>
      )}
    </section>
  );
}
