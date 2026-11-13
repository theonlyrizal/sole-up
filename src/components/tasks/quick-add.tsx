"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { useMediaQuery } from "@/components/hooks/use-media-query";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { ActionError } from "@/lib/result";
import { isInboxTask, parentFromChoice, TASK_TITLE_MAX } from "@/lib/tasks";
import {
  createTask,
  getTaskParentOptions,
} from "@/server/modules/tasks/actions";
import type { TaskParentOption } from "@/server/modules/tasks/queries";

import { TaskParentSelect } from "./task-parent-select";

/** True when a key press is meant for the page, not for a field. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * Global quick add: Create → New task, Q on Create, or Alt+Enter outside a
 * field or dialog. Only the title is needed; Enter adds the task. A goal or
 * milestone, a planned date and a due date are optional, behind "More
 * options". Priority and estimate are left for the edit form (ADR 0011).
 */
export function QuickAdd({
  open,
  onOpenChange,
  onShortcut,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShortcut: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const compact = useMediaQuery("medium") === false;
  const writingRef = useRef(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Enter" ||
        !event.altKey ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented ||
        isTypingTarget(event.target) ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      onShortcut();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onShortcut]);

  function setOpen(next: boolean) {
    if (!writingRef.current) onOpenChange(next);
  }
  const form = (
    <QuickAddForm writingRef={writingRef} onAdded={() => onOpenChange(false)} />
  );
  return compact ? (
    <BottomSheet
      title="Add task"
      open={open}
      onOpenChange={setOpen}
      onCloseAutoFocus={onCloseAutoFocus}
      fitKeyboard
    >
      {form}
    </BottomSheet>
  ) : (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Add task"
        className="max-w-120"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {form}
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({
  onAdded,
  writingRef,
}: {
  onAdded: () => void;
  writingRef: React.RefObject<boolean>;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [parent, setParent] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [parentOptions, setParentOptions] = useState<TaskParentOption[] | null>(
    null,
  );
  const [optionsError, setOptionsError] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  // The goal picker's options are read when "More options" first opens, so
  // a plain capture never waits for them.
  useEffect(() => {
    if (!showOptions || parentOptions) return;
    let cancelled = false;
    getTaskParentOptions({}).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) setParentOptions(result.data);
        else setOptionsError(true);
      },
      () => {
        if (!cancelled) setOptionsError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [showOptions, parentOptions]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writingRef.current) return;
    writingRef.current = true;
    startTransition(async () => {
      setError(null);
      try {
        const result = await createTask({
          title,
          ...parentFromChoice(parent),
          plannedDate,
          dueDate,
        });
        if (result.ok) {
          toast({
            title: isInboxTask(result.data) ? "Added to Inbox" : "Task added",
            variant: "success",
          });
          onAdded();
        } else {
          setError(result.error);
          // Errors on the optional fields need those fields in view.
          const { fieldErrors } =
            result.error.code === "VALIDATION"
              ? result.error
              : { fieldErrors: {} };
          if (Object.keys(fieldErrors).some((key) => key !== "title")) {
            setShowOptions(true);
          }
        }
      } catch {
        setError({
          code: "INTERNAL",
          message: "Couldn't add the task. Try again.",
        });
      } finally {
        writingRef.current = false;
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const parentErrors = [
    ...(fieldErrors.goalId ?? []),
    ...(fieldErrors.milestoneId ?? []),
  ];
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Add task"
      aria-busy={pending || undefined}
      className="flex flex-col gap-4"
    >
      <FormField
        id={`${id}-title`}
        label="Task title"
        errors={fieldErrors.title}
      >
        {(control) => (
          <Input
            {...control}
            name="title"
            value={title}
            maxLength={TASK_TITLE_MAX}
            autoComplete="off"
            readOnly={pending}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </FormField>

      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        aria-expanded={showOptions}
        aria-controls={`${id}-options`}
        onClick={() => setShowOptions((shown) => !shown)}
      >
        {showOptions ? "Fewer options" : "More options"}
      </Button>

      <div
        id={`${id}-options`}
        hidden={!showOptions}
        className="flex flex-col gap-4"
      >
        <FormField
          id={`${id}-parent`}
          label="Goal or milestone"
          hint={
            optionsError
              ? "Your goals couldn't load. You can still add the task and assign it later."
              : undefined
          }
          errors={parentErrors}
        >
          {(control) => (
            <TaskParentSelect
              {...control}
              name="parent"
              value={parent}
              options={parentOptions ?? []}
              noneLabel={parentOptions ? "None" : "Loading goals…"}
              disabled={!parentOptions}
              onChange={(event) => setParent(event.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${id}-planned`}
            label="Plan for"
            errors={fieldErrors.plannedDate}
          >
            {(control) => (
              <Input
                {...control}
                type="date"
                name="plannedDate"
                value={plannedDate}
                onChange={(event) => setPlannedDate(event.target.value)}
              />
            )}
          </FormField>
          <FormField id={`${id}-due`} label="Due" errors={fieldErrors.dueDate}>
            {(control) => (
              <Input
                {...control}
                type="date"
                name="dueDate"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </div>

      <FormError error={error} />
      {pending && (
        <span role="status" className="sr-only">
          Adding task…
        </span>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          pending={pending}
          className="w-full medium:w-auto"
        >
          Add
        </Button>
      </div>
    </form>
  );
}
