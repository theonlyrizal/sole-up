"use client";

import { useId, useState, useTransition } from "react";

import { PickerField } from "@/components/calendar/picker-field";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  GOAL_DESCRIPTION_MAX,
  GOAL_PRIORITIES,
  GOAL_REASON_MAX,
  GOAL_TITLE_MAX,
  type Goal,
  type GoalPriority,
} from "@/lib/goals";
import type { LifeArea } from "@/lib/life-areas";
import type { ActionError } from "@/lib/result";
import { createGoal, updateGoal } from "@/server/modules/goals/actions";

const PRIORITY_OPTION_LABELS: Record<GoalPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

type GoalFormDialogProps = {
  /** The element that opens the dialog, usually a `<Button>`. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /** The goal to edit; omit to create one. */
  goal?: Goal;
  /** Every area, active first (see `GoalsView.areas`). */
  areas: LifeArea[];
  /** Runs after a successful save, once the dialog has closed. */
  onSaved?: (goal: Goal) => void;
};

/**
 * Creates or edits a goal in a dialog. Only the title is required, so a
 * goal can be captured in seconds and filled in later.
 */
export function GoalFormDialog(props: GoalFormDialogProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.open ?? localOpen;
  const onOpenChange = props.onOpenChange ?? setLocalOpen;
  const { goal, areas, trigger, onCloseAutoFocus, onSaved } = props;
  const id = useId();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [reason, setReason] = useState(goal?.reason ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(goal?.lifeAreaId ?? "");
  const [priority, setPriority] = useState<GoalPriority | "">(
    goal?.priority ?? "",
  );
  const [startDate, setStartDate] = useState(goal?.startDate ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [transportError, setTransportError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTitle(goal?.title ?? "");
      setReason(goal?.reason ?? "");
      setLifeAreaId(goal?.lifeAreaId ?? "");
      setPriority(goal?.priority ?? "");
      setStartDate(goal?.startDate ?? "");
      setTargetDate(goal?.targetDate ?? "");
      setDescription(goal?.description ?? "");
      setError(null);
      setTransportError(false);
    }
  }

  // Active areas, plus the goal's own area if it has since been archived,
  // so editing never silently moves a goal out of its area.
  const areaOptions = areas.filter(
    (area) => area.status === "active" || area.id === goal?.lifeAreaId,
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      setError(null);
      setTransportError(false);
      const fields = {
        title,
        reason,
        description,
        lifeAreaId: lifeAreaId || null,
        priority: priority || null,
        startDate,
        targetDate,
      };
      try {
        const result = goal
          ? await updateGoal({ id: goal.id, ...fields })
          : await createGoal(fields);
        if (result.ok) {
          toast({
            title: goal ? "Goal saved" : "Goal added",
            variant: "success",
          });
          onOpenChange(false);
          onSaved?.(result.data);
        } else {
          setError(result.error);
        }
      } catch {
        setTransportError(true);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  return (
    <FormDialog
      title={goal ? "Edit goal" : "New goal"}
      trigger={trigger}
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange?.(next);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      pending={pending}
      formId={id}
      submitLabel={goal ? "Save" : "Add goal"}
    >
      <form
        id={id}
        onSubmit={submit}
        noValidate
        aria-label={goal ? `Edit ${goal.title}` : "New goal"}
        className="flex flex-col gap-4"
      >
        <FormField id={`${id}-title`} label="Title" errors={fieldErrors.title}>
          {(control) => (
            <Input
              {...control}
              name="title"
              value={title}
              maxLength={GOAL_TITLE_MAX}
              autoComplete="off"
              autoFocus
              placeholder="e.g. Run a half marathon"
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </FormField>
        <FormField
          id={`${id}-reason`}
          label="Why does this matter?"
          hint="Optional, and you can add it later. A sentence in your own words helps when it's hard to keep going."
          errors={fieldErrors.reason}
        >
          {(control) => (
            <Textarea
              {...control}
              name="reason"
              rows={3}
              value={reason}
              maxLength={GOAL_REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${id}-area`}
            label="Life area"
            errors={fieldErrors.lifeAreaId}
          >
            {(control) => (
              <Select
                {...control}
                name="lifeAreaId"
                value={lifeAreaId}
                onChange={(event) => setLifeAreaId(event.target.value)}
              >
                <option value="">No area</option>
                {areaOptions.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.status === "archived"
                      ? `${area.name} (archived)`
                      : area.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField
            id={`${id}-priority`}
            label="Priority"
            errors={fieldErrors.priority}
          >
            {(control) => (
              <Select
                {...control}
                name="priority"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as GoalPriority | "")
                }
              >
                <option value="">None</option>
                {GOAL_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_OPTION_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <PickerField
            id={`${id}-start`}
            label="Start date"
            type="date"
            value={startDate}
            name="startDate"
            errors={fieldErrors.startDate}
            clearable
            onChange={setStartDate}
          />
          <PickerField
            id={`${id}-target`}
            label="Target date"
            type="date"
            value={targetDate}
            name="targetDate"
            errors={fieldErrors.targetDate}
            min={startDate || undefined}
            clearable
            onChange={setTargetDate}
          />
        </div>
        <FormField
          id={`${id}-description`}
          label="Notes"
          hint="Optional. Anything else worth remembering about this goal."
          errors={fieldErrors.description}
        >
          {(control) => (
            <Textarea
              {...control}
              name="description"
              rows={2}
              value={description}
              maxLength={GOAL_DESCRIPTION_MAX}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>
        <FormError error={error} />
        {transportError && (
          <p role="alert" className="text-body-medium text-error">
            Couldn&apos;t save the goal. Try again.
          </p>
        )}
      </form>
    </FormDialog>
  );
}
