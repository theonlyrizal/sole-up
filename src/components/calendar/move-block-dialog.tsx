"use client";

import { useEffect, useId, useState, useTransition } from "react";

import { FormDialog } from "@/components/ui/form-dialog";
import { toast } from "@/components/ui/toast";
import {
  type BlockTimesPayload,
  blockOriginalStart,
  movedSeriesRule,
} from "@/lib/block-form";
import type { ActionError, ActionResult } from "@/lib/result";
import type { TimeBlockOccurrence, TimeBlockScope } from "@/lib/time-blocks";
import {
  editTimeBlockOccurrence,
  previewTimeBlockOccurrenceEdit,
} from "@/server/modules/time-blocks/actions";

import { BlockScopeStep } from "./block-form";
import type { ScopeOption } from "./scope-chooser";

/** An occurrence of a repeating block dragged or resized on the grid. */
export type PendingBlockMove = {
  block: TimeBlockOccurrence;
  /** Its new times, in its own zone. */
  times: BlockTimesPayload;
  /** Its new start instant, for following the series' weekday. */
  start: Date;
  /** "move" or "resize", for the wording. */
  kind: "move" | "resize";
  /** Puts the item back on the grid. */
  revert: () => void;
};

/**
 * Asks which occurrences a drag or resize of a repeating block applies to
 * (ADR 0012). Cancelling (or closing) puts the block back. The keyboard
 * path for the same change is the block's dialog.
 */
export function MoveBlockDialog({
  move,
  locale,
  timeZone,
  onDone,
}: {
  move: PendingBlockMove | null;
  locale: string;
  timeZone: string;
  /** Called once the move is saved or cancelled. */
  onDone: () => void;
}) {
  return (
    move && (
      <MoveBlockScope
        move={move}
        locale={locale}
        timeZone={timeZone}
        onDone={onDone}
      />
    )
  );
}

function MoveBlockScope({
  move,
  locale,
  timeZone,
  onDone,
}: {
  move: PendingBlockMove;
  locale: string;
  timeZone: string;
  onDone: () => void;
}) {
  const id = useId();
  const { block, times } = move;
  const [scope, setScope] = useState<TimeBlockScope>("this");
  const [options, setOptions] = useState<
    Partial<Record<TimeBlockScope, ScopeOption>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const originalStart = blockOriginalStart(block)!;
  const rrule = movedSeriesRule(block, move.start);

  useEffect(() => {
    let current = true;
    const key = { id: block.id, originalStart };
    void Promise.all([
      previewTimeBlockOccurrenceEdit({
        ...key,
        scope: "following",
        ...times,
        rrule,
      }),
      previewTimeBlockOccurrenceEdit({ ...key, scope: "all", ...times, rrule }),
    ]).then(([following, all]) => {
      if (!current) return;
      setLoading(false);
      if (!following.ok) return setError(following.error);
      if (!all.ok) return setError(all.error);
      setOptions({
        following: { dropped: following.data.dropped },
        all: { dropped: all.data.dropped },
      });
    });
    return () => {
      current = false;
    };
  }, [block.id, originalStart, times, rrule]);

  function save() {
    startTransition(async () => {
      const key = { id: block.id, originalStart };
      const result: ActionResult<unknown> =
        scope === "this"
          ? await editTimeBlockOccurrence({ ...key, scope, ...times })
          : await editTimeBlockOccurrence({ ...key, scope, ...times, rrule });
      if (!result.ok) return setError(result.error);
      toast({
        title: scope === "this" ? "Block saved" : "Blocks saved",
        variant: "success",
      });
      onDone();
    });
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (open || pending) return;
        move.revert();
        onDone();
      }}
      title={move.kind === "move" ? "Move block" : "Change block length"}
      description={`For “${block.taskTitle}”.`}
      formId={id}
      submitLabel={pending ? "Saving…" : "Save"}
      pending={pending}
      submitDisabled={loading}
    >
      <BlockScopeStep
        id={`${id}-scope`}
        formId={id}
        intro="This block repeats."
        scope={scope}
        options={options}
        loading={loading}
        pending={pending}
        error={error}
        locale={locale}
        timeZone={timeZone}
        onChange={setScope}
        showBack={false}
        onSave={save}
      />
    </FormDialog>
  );
}
