"use client";

import { AlertDialog } from "radix-ui";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  contentClass,
  Dialog,
  DialogContent,
  overlayClass,
} from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { toast } from "@/components/ui/toast";
import {
  type BlockFormValues,
  blockFormValuesOf,
  blockKey,
  blockOriginalStart,
  blockStatusActions,
  blockStatusLabel,
  blockTimesPayload,
  offersCompleteTask,
  offersEndSeries,
  thisBlockBlocker,
} from "@/lib/block-form";
import { localDateOf } from "@/lib/dates";
import { timeRangeLabel, type RepeatErrors } from "@/lib/event-form";
import { describeRecurrence } from "@/lib/recurrence-rules";
import type { ActionError, ActionResult } from "@/lib/result";
import type { TaskStatus } from "@/lib/tasks";
import type {
  TimeBlockOccurrence,
  TimeBlockScope,
  TimeBlockStatus,
} from "@/lib/time-blocks";
import { changeTaskStatus } from "@/server/modules/tasks/actions";
import {
  deleteTimeBlock,
  deleteTimeBlockOccurrence,
  editTimeBlockOccurrence,
  previewTimeBlockOccurrenceDelete,
  previewTimeBlockOccurrenceEdit,
  setTimeBlockStatus,
  updateTimeBlock,
} from "@/server/modules/time-blocks/actions";

import {
  BlockScopeStep,
  BlockTimesFields,
  otherBlockErrors,
  readBlockRepeat,
  useFocusFirstInvalid,
} from "./block-form";
import { type ScopeOption, ScopeChooser } from "./scope-chooser";

type BlockDialogProps = {
  block: TimeBlockOccurrence;
  userTimeZone: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * A time block's dialog (chunk 4.8), opened from its item on the calendar:
 * when it is and its status, the status actions, "Also complete the task"
 * once it is done, "End series here" on a completed task's future
 * occurrences, and its times to change (the keyboard path for dragging
 * and resizing) or delete.
 */
export function BlockDialog({
  block,
  userTimeZone,
  locale,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: BlockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Time block"
        description={`For “${block.taskTitle}”.`}
        className="max-w-xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <BlockDetails
          block={block}
          userTimeZone={userTimeZone}
          locale={locale}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type Step =
  | { kind: "form" }
  | {
      kind: "scope";
      scope: TimeBlockScope;
      options: Partial<Record<TimeBlockScope, ScopeOption>>;
    };

function BlockDetails({
  block,
  userTimeZone,
  locale,
  onClose,
}: {
  block: TimeBlockOccurrence;
  userTimeZone: string;
  locale: string;
  onClose: () => void;
}) {
  const id = useId();
  // The dialog keeps the clicked item, so status and task changes made
  // here show here at once, before the page's data refreshes.
  const [status, setStatus] = useState<TimeBlockStatus>(block.status);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(block.taskStatus);
  const [now] = useState(() => new Date());
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusPending, startStatus] = useTransition();

  const [values, setValues] = useState<BlockFormValues>(() =>
    blockFormValuesOf(block),
  );
  const [repeatChanged, setRepeatChanged] = useState(false);
  const [repeatErrors, setRepeatErrors] = useState<RepeatErrors>({});
  const [error, setError] = useState<ActionError | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [pending, startTransition] = useTransition();
  const [attempt, setAttempt] = useState(0);
  const formRef = useFocusFirstInvalid(attempt);

  const originalStart = blockOriginalStart(block);
  const current = { ...block, status, taskStatus };
  const label = blockStatusLabel(current, now);

  function changeStatus(next: TimeBlockStatus, message: string) {
    startStatus(async () => {
      setStatusError(null);
      const result = await setTimeBlockStatus({
        ...blockKey(block),
        status: next,
      });
      if (!result.ok) return setStatusError(result.error.message);
      setStatus(next);
      toast({ title: message, variant: "success" });
    });
  }

  function completeTask() {
    startStatus(async () => {
      setStatusError(null);
      const result = await changeTaskStatus({
        id: block.taskId,
        status: "completed",
      });
      if (!result.ok) return setStatusError(result.error.message);
      setTaskStatus("completed");
      toast({ title: "Task completed", variant: "success" });
    });
  }

  function fail(actionError: ActionError) {
    setError(actionError);
    if (actionError.code === "VALIDATION") {
      setStep({ kind: "form" });
      setAttempt((count) => count + 1);
    }
  }

  /** The payload, or null after showing the repeat builder's errors. */
  function readPayload() {
    const repeat = readBlockRepeat(values);
    if (!repeat.ok) {
      setRepeatErrors(repeat.errors);
      setError(null);
      setAttempt((count) => count + 1);
      return null;
    }
    setRepeatErrors({});
    return { ...blockTimesPayload(values), rrule: repeat.rrule };
  }

  function saved(message = "Block saved") {
    toast({ title: message, variant: "success" });
    onClose();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = readPayload();
    if (!payload) return;
    startTransition(async () => {
      if (originalStart === null) {
        const result = await updateTimeBlock({ id: block.id, ...payload });
        if (result.ok) saved();
        else fail(result.error);
        return;
      }
      // One occurrence of a series: find out what the wider scopes would
      // drop (this also validates), then ask which blocks to change.
      const key = { id: block.id, originalStart };
      const [following, all] = await Promise.all([
        previewTimeBlockOccurrenceEdit({
          ...key,
          scope: "following",
          ...payload,
        }),
        previewTimeBlockOccurrenceEdit({ ...key, scope: "all", ...payload }),
      ]);
      const failed = [following, all].find(
        (result): result is Extract<typeof result, { ok: false }> => !result.ok,
      );
      if (failed) return fail(failed.error);
      setError(null);
      const blocker = thisBlockBlocker(repeatChanged);
      setStep({
        kind: "scope",
        scope: blocker ? "following" : "this",
        options: {
          this: { blocker },
          following: { dropped: following.ok ? following.data.dropped : [] },
          all: { dropped: all.ok ? all.data.dropped : [] },
        },
      });
    });
  }

  function saveWithScope(scope: TimeBlockScope) {
    const payload = readPayload();
    if (originalStart === null || !payload) return;
    const { rrule, ...times } = payload;
    startTransition(async () => {
      const key = { id: block.id, originalStart };
      const result: ActionResult<unknown> =
        scope === "this"
          ? await editTimeBlockOccurrence({ ...key, scope, ...times })
          : await editTimeBlockOccurrence({ ...key, scope, ...times, rrule });
      if (result.ok) saved(scope === "this" ? "Block saved" : "Blocks saved");
      else fail(result.error);
    });
  }

  if (step.kind === "scope") {
    return (
      <BlockScopeStep
        id={`${id}-scope`}
        intro="This block repeats."
        scope={step.scope}
        options={step.options}
        loading={false}
        pending={pending}
        error={error}
        locale={locale}
        timeZone={userTimeZone}
        onChange={(scope) => setStep({ ...step, scope })}
        onBack={() => {
          setError(null);
          setStep({ kind: "form" });
        }}
        onSave={() => saveWithScope(step.scope)}
      />
    );
  }

  const repeatSummary = block.rrule
    ? describeRecurrence(block.rrule, {
        start: localDateOf(block.startAt, block.tz),
        locale,
      })
    : null;
  const otherErrors = otherBlockErrors(error);
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">When</dt>
        <dd>
          {timeRangeLabel(
            block.startAt,
            block.endAt,
            locale,
            userTimeZone,
            true,
          )}
          {block.tz !== userTimeZone && (
            <span className="text-muted">
              {` (${timeRangeLabel(block.startAt, block.endAt, locale, block.tz)} ${block.tz})`}
            </span>
          )}
        </dd>
        <dt className="text-muted">Status</dt>
        <dd>{label}</dd>
        {repeatSummary && (
          <>
            <dt className="text-muted">Repeats</dt>
            <dd>
              {repeatSummary}
              {block.modified && (
                <span className="text-muted"> (this one changed)</span>
              )}
            </dd>
          </>
        )}
        {taskStatus !== "open" && (
          <>
            <dt className="text-muted">Task</dt>
            <dd>
              {taskStatus === "completed" ? "Task completed" : "Task cancelled"}
            </dd>
          </>
        )}
      </dl>

      <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
        {blockStatusActions(status).map((action) => (
          <Button
            key={action.status}
            variant={action.status === "done" ? "primary" : "secondary"}
            size="sm"
            disabled={statusPending}
            onClick={() => changeStatus(action.status, action.toast)}
          >
            {action.label}
          </Button>
        ))}
        {offersCompleteTask(current) && (
          <Button
            variant="secondary"
            size="sm"
            disabled={statusPending}
            onClick={completeTask}
          >
            Also complete the task
          </Button>
        )}
        {offersEndSeries(current, now) && originalStart !== null && (
          <ConfirmDialog
            trigger={
              <Button variant="secondary" size="sm" disabled={statusPending}>
                End series here
              </Button>
            }
            title="End the series here?"
            description="This occurrence and every later one are deleted. Earlier ones are kept. It can't be undone."
            confirmLabel="End series"
            onConfirm={async () => {
              const result = await deleteTimeBlockOccurrence({
                id: block.id,
                originalStart,
                scope: "following",
              });
              if (result.ok) {
                toast({ title: "Series ended", variant: "success" });
                onClose();
              }
              return result;
            }}
          />
        )}
      </div>
      {statusError && (
        <p role="alert" className="text-sm text-danger">
          {statusError}
        </p>
      )}

      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        aria-label="Change the block's times"
        className="flex flex-col gap-4 border-t border-border pt-4"
      >
        <BlockTimesFields
          id={id}
          values={values}
          onChange={setValues}
          onRepeatChange={() => setRepeatChanged(true)}
          fieldErrors={error?.code === "VALIDATION" ? error.fieldErrors : {}}
          repeatErrors={repeatErrors}
          userTimeZone={userTimeZone}
          locale={locale}
        />
        <FormError error={error} />
        {otherErrors.length > 0 && (
          <p role="alert" className="text-sm text-danger">
            {otherErrors.join(" ")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            Close
          </Button>
          <span className="ml-auto">
            <DeleteBlockDialog
              block={block}
              locale={locale}
              timeZone={userTimeZone}
              onDeleted={onClose}
            />
          </span>
        </div>
      </form>
    </div>
  );
}

/**
 * Deletes a block after confirming: a one-off outright; for an occurrence
 * the user chooses this block, this and following, or all blocks, and
 * sees which separately changed occurrences go with them.
 */
function DeleteBlockDialog({
  block,
  locale,
  timeZone,
  onDeleted,
}: {
  block: TimeBlockOccurrence;
  locale: string;
  timeZone: string;
  onDeleted: () => void;
}) {
  const trigger = (
    <Button variant="ghost" size="sm" aria-label="Delete block">
      Delete
    </Button>
  );
  const originalStart = blockOriginalStart(block);
  if (originalStart === null) {
    return (
      <ConfirmDialog
        trigger={trigger}
        title="Delete this block?"
        description={`This deletes the time blocked for “${block.taskTitle}” and its history. The task is kept. It can't be undone.`}
        confirmLabel="Delete block"
        onConfirm={async () => {
          const result = await deleteTimeBlock({ id: block.id });
          if (result.ok) {
            toast({ title: "Block deleted", variant: "success" });
            onDeleted();
          }
          return result;
        }}
      />
    );
  }
  return (
    <DeleteOccurrenceDialog
      trigger={trigger}
      block={block}
      originalStart={originalStart}
      locale={locale}
      timeZone={timeZone}
      onDeleted={onDeleted}
    />
  );
}

function DeleteOccurrenceDialog({
  trigger,
  block,
  originalStart,
  locale,
  timeZone,
  onDeleted,
}: {
  trigger: React.ReactElement;
  block: TimeBlockOccurrence;
  originalStart: string;
  locale: string;
  timeZone: string;
  onDeleted: () => void;
}) {
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<TimeBlockScope>("this");
  const [options, setOptions] = useState<
    Partial<Record<TimeBlockScope, ScopeOption>>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = { id: block.id, originalStart };

  async function loadPreviews() {
    setLoading(true);
    const [following, all] = await Promise.all([
      previewTimeBlockOccurrenceDelete({ ...key, scope: "following" }),
      previewTimeBlockOccurrenceDelete({ ...key, scope: "all" }),
    ]);
    setLoading(false);
    if (!following.ok) return setError(following.error.message);
    if (!all.ok) return setError(all.error.message);
    setOptions({
      following: { dropped: following.data.dropped },
      all: { dropped: all.data.dropped },
    });
  }

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setScope("this");
      setOptions({});
      setError(null);
      void loadPreviews();
    }
  }

  function confirm() {
    startTransition(async () => {
      setError(null);
      const result = await deleteTimeBlockOccurrence({ ...key, scope });
      if (!result.ok) return setError(result.error.message);
      toast({
        title: scope === "this" ? "Block deleted" : "Blocks deleted",
        variant: "success",
      });
      setOpen(false);
      onDeleted();
    });
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={changeOpen}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          ref={contentRef}
          className={contentClass}
          onOpenAutoFocus={(focusEvent) => {
            // Start on the choice rather than Cancel: it's the question.
            const radio =
              contentRef.current?.querySelector<HTMLInputElement>(
                "input:checked",
              );
            if (radio) {
              focusEvent.preventDefault();
              radio.focus();
            }
          }}
        >
          <AlertDialog.Title className="text-lg font-semibold">
            Delete this block?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-muted">
            {`This block for “${block.taskTitle}” repeats. Deleted blocks can't be brought back; the task is kept.`}
          </AlertDialog.Description>
          <ScopeChooser
            id={`${id}-scope`}
            noun="block"
            legend="Delete"
            action="delete"
            value={scope}
            onChange={setScope}
            options={options}
            loading={loading}
            locale={locale}
            timeZone={timeZone}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              disabled={pending || loading}
              onClick={confirm}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
