"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { NOTE_LINK_QUERY_MAX } from "@/lib/notes/note";
import {
  findLinkTargets,
  getNoteLinks,
  linkNote,
  unlinkNote,
} from "@/server/modules/notes/actions";
import type { LinkTarget } from "@/server/modules/notes/queries";

import { usePickerSearch } from "./use-picker-search";

const TARGET_TYPE_LABELS: Record<LinkTarget["targetType"], string> = {
  goal: "Goal",
  task: "Task",
};

const targetKey = (target: Pick<LinkTarget, "targetType" | "targetId">) =>
  `${target.targetType}:${target.targetId}`;

/**
 * The editor's "Linked to" section (chunk 8.3): the goals and tasks the
 * note links to, with their status and Unlink, and a picker to link more.
 * A note that isn't saved yet can't be linked; one opened with "New note"
 * from a goal or task shows that pending link until its first save.
 */
export function NoteLinks({
  noteId,
  pendingLink,
}: {
  noteId: string | null;
  pendingLink: LinkTarget | null;
}) {
  const headingId = useId();
  const [links, setLinks] = useState<LinkTarget[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped to read the links again.
  const [version, setVersion] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    getNoteLinks({ id: noteId }).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          setLinks(result.data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [noteId, version]);

  function unlink(target: LinkTarget) {
    if (!noteId) return;
    startTransition(async () => {
      const result = await unlinkNote({
        id: noteId,
        targetType: target.targetType,
        targetId: target.targetId,
      });
      if (!result.ok) {
        toast({ title: result.error.message, variant: "error" });
        return;
      }
      toast({ title: "Unlinked", variant: "success" });
      setVersion((count) => count + 1);
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          Linked to
        </h2>
        {noteId && links && (
          <LinkTargetDialog
            noteId={noteId}
            linked={links}
            onLinked={() => setVersion((count) => count + 1)}
          />
        )}
      </div>
      {!noteId ? (
        pendingLink ? (
          <>
            <LinkTargetList targets={[pendingLink]} />
            <p className="text-sm text-muted">
              Linked once the note has a title or some text.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Give the note a title or some text, then link it to goals and tasks.
          </p>
        )
      ) : failed ? (
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load the links. Try reloading the note.
        </p>
      ) : !links ? (
        <p className="text-sm text-muted">Loading links…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted">
          Not linked to any goals or tasks yet.
        </p>
      ) : (
        <LinkTargetList targets={links} pending={pending} onUnlink={unlink} />
      )}
    </section>
  );
}

function LinkTargetList({
  targets,
  pending = false,
  onUnlink,
}: {
  targets: LinkTarget[];
  pending?: boolean;
  onUnlink?: (target: LinkTarget) => void;
}) {
  return (
    <ul
      aria-label="Linked goals and tasks"
      className="flex flex-col divide-y divide-border rounded-lg border border-border"
    >
      {targets.map((target) => (
        <li
          key={targetKey(target)}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
        >
          <div className="flex min-w-0 flex-col">
            {target.targetType === "goal" ? (
              <Link
                href={`/goals/${target.targetId}`}
                className={cx(
                  "self-start rounded-sm font-medium break-words hover:underline",
                  focusRing,
                )}
              >
                {target.title}
              </Link>
            ) : (
              // Tasks have no page of their own; their dialog is on Plan.
              <span className="font-medium break-words">{target.title}</span>
            )}
            <span className="text-sm text-muted">
              {TARGET_TYPE_LABELS[target.targetType]} · {target.statusLabel}
            </span>
          </div>
          {onUnlink && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-label={`Unlink ${target.title}`}
              onClick={() => onUnlink(target)}
            >
              Unlink
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "Link a goal or task": search the user's goals and tasks, any status. */
function LinkTargetDialog({
  noteId,
  linked,
  onLinked,
}: {
  noteId: string;
  linked: LinkTarget[];
  onLinked: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Link a goal or task
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Link a goal or task"
        description="Search your goals and tasks, whatever their status."
        className="max-w-lg"
      >
        <LinkTargetPicker noteId={noteId} linked={linked} onLinked={onLinked} />
      </DialogContent>
    </Dialog>
  );
}

function LinkTargetPicker({
  noteId,
  linked,
  onLinked,
}: {
  noteId: string;
  linked: LinkTarget[];
  onLinked: () => void;
}) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const search = usePickerSearch(query, (text) =>
    findLinkTargets({ query: text }),
  );
  const linkedKeys = new Set(linked.map(targetKey));

  function link(target: LinkTarget) {
    startTransition(async () => {
      const result = await linkNote({
        id: noteId,
        targetType: target.targetType,
        targetId: target.targetId,
      });
      if (!result.ok) {
        toast({ title: result.error.message, variant: "error" });
        return;
      }
      // "Linked" replaces the button, so focus goes back to the search. No
      // toast: the row says it, and a toast would take the next Escape.
      searchRef.current?.focus();
      onLinked();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">
          Search goals and tasks
        </label>
        <Input
          id={searchId}
          ref={searchRef}
          type="search"
          value={query}
          maxLength={NOTE_LINK_QUERY_MAX}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {search.kind === "loading" ? (
        <p className="text-sm text-muted">Loading goals and tasks…</p>
      ) : search.kind === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {search.message}
        </p>
      ) : (
        (["goals", "tasks"] as const).map((group) => (
          <TargetGroup
            key={group}
            label={group === "goals" ? "Goals" : "Tasks"}
            targets={search.data[group]}
            empty={
              query.trim() ? `No ${group} match.` : `You have no ${group} yet.`
            }
            isLinked={(target) => linkedKeys.has(targetKey(target))}
            pending={pending}
            onLink={link}
          />
        ))
      )}
    </div>
  );
}

function TargetGroup({
  label,
  targets,
  empty,
  isLinked,
  pending,
  onLink,
}: {
  label: string;
  targets: LinkTarget[];
  empty: string;
  isLinked: (target: LinkTarget) => boolean;
  pending: boolean;
  onLink: (target: LinkTarget) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <h3 id={headingId} className="text-sm font-semibold">
        {label}
      </h3>
      {targets.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {targets.map((target) => (
            <li
              key={targetKey(target)}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{target.title}</span>
                <span className="text-sm text-muted">{target.statusLabel}</span>
              </div>
              {isLinked(target) ? (
                <span className="shrink-0 text-sm text-muted">Linked</span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={pending}
                  aria-label={`Link ${target.title}`}
                  onClick={() => onLink(target)}
                >
                  Link
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
