"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ListGroup, ListItem } from "@/components/ui/list";
import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
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
  children,
}: {
  noteId: string | null;
  pendingLink: LinkTarget | null;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const pickerTrigger = useRef<HTMLButtonElement>(null);
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
      pickerTrigger.current?.focus();
      setVersion((count) => count + 1);
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 grid min-w-0 gap-3 rounded-lg bg-resting-surface p-4 text-on-resting-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-title-medium">
          Linked to
        </h2>
        {noteId && links && (
          <LinkTargetDialog
            triggerRef={pickerTrigger}
            noteId={noteId}
            linked={links}
            onLinked={() => setVersion((count) => count + 1)}
          />
        )}
      </div>
      {!noteId ? (
        pendingLink ? (
          <p className="text-body-medium text-on-surface-variant">
            Linked once the note has a title or some text.
          </p>
        ) : (
          <p className="text-body-medium text-on-surface-variant">
            Give the note a title or some text, then link it to goals and tasks.
          </p>
        )
      ) : failed ? (
        <p role="alert" className="text-body-medium text-error">
          Couldn&apos;t load the links. Try reloading the note.
        </p>
      ) : !links ? (
        <p className="text-body-medium text-on-surface-variant">
          Loading links…
        </p>
      ) : links.length === 0 ? (
        <p className="text-body-medium text-on-surface-variant">
          Not linked to any goals or tasks yet.
        </p>
      ) : (
        <LinkTargetList targets={links} pending={pending} onUnlink={unlink} />
      )}
      {children}
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
  onUnlink: (target: LinkTarget) => void;
}) {
  return (
    <ul
      aria-label="Linked goals and tasks"
      className="flex min-w-0 flex-wrap gap-2"
    >
      {targets.map((target) => (
        <li key={targetKey(target)} className="max-w-full min-w-0">
          <Chip
            type="input"
            label={target.title}
            icon={target.targetType === "goal" ? "flag" : "checklist"}
            href={
              target.targetType === "goal"
                ? `/goals/${target.targetId}`
                : undefined
            }
            detail={
              <Chip
                type="status"
                label={`${TARGET_TYPE_LABELS[target.targetType]} · ${target.statusLabel}`}
              />
            }
            removeLabel={`Unlink ${target.title}`}
            onRemove={() => onUnlink(target)}
            removeDisabled={pending}
          />
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
  triggerRef,
}: {
  noteId: string;
  linked: LinkTarget[];
  onLinked: () => void;
  triggerRef: React.Ref<HTMLButtonElement>;
}) {
  return (
    <ResponsiveSheet
      fitKeyboard
      title="Link a goal or task"
      description="Search your goals and tasks, whatever their status."
      trigger={
        <Button
          ref={triggerRef}
          variant="tonal"
          size="xs"
          icon="link"
          aria-label="Link a goal or task"
        >
          Link
        </Button>
      }
    >
      <LinkTargetPicker noteId={noteId} linked={linked} onLinked={onLinked} />
    </ResponsiveSheet>
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
        <label htmlFor={searchId} className="text-label-large">
          Search goals and tasks
        </label>
        <Input
          id={searchId}
          ref={searchRef}
          type="search"
          autoFocus
          value={query}
          maxLength={NOTE_LINK_QUERY_MAX}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {search.kind === "loading" ? (
        <p className="text-body-medium text-on-surface-variant">
          Loading goals and tasks…
        </p>
      ) : search.kind === "error" ? (
        <p role="alert" className="text-body-medium text-error">
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
      <h3 id={headingId} className="text-title-small">
        {label}
      </h3>
      {targets.length === 0 ? (
        <p className="text-body-medium text-on-surface-variant">{empty}</p>
      ) : (
        <ListGroup label={label}>
          {targets.map((target) => (
            <ListItem
              key={targetKey(target)}
              headline={target.title}
              supporting={target.statusLabel}
              trailing={
                isLinked(target) ? (
                  <Chip type="status" label="Linked" tone="success" />
                ) : (
                  <Button
                    variant="tonal"
                    size="xs"
                    disabled={pending}
                    aria-label={`Link ${target.title}`}
                    onClick={() => onLink(target)}
                  >
                    Link
                  </Button>
                )
              }
              wrapActions
            />
          ))}
        </ListGroup>
      )}
    </section>
  );
}
