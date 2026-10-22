import { Select } from "@/components/ui/select";
import type { TaskParentChoice } from "@/lib/tasks";
import type { TaskParentOption } from "@/server/modules/tasks/queries";

type TaskParentSelectProps = Omit<
  React.ComponentProps<typeof Select>,
  "children"
> & {
  options: TaskParentOption[];
  /** The label of the "" option. */
  noneLabel: string;
  /**
   * The task's current parent, offered even when `options` leaves it out
   * (a completed goal, a closed milestone), so editing never silently
   * moves a task.
   */
  current?: { value: TaskParentChoice; label: string } | null;
};

function offers(options: TaskParentOption[], value: TaskParentChoice) {
  return options.some(
    (goal) =>
      `goal:${goal.id}` === value ||
      goal.milestones.some(
        (milestone) => `milestone:${milestone.id}` === value,
      ),
  );
}

/**
 * Picks a goal or one of its open milestones. Values are TaskParentChoice
 * strings; turn them back into IDs with `parentFromChoice`.
 */
export function TaskParentSelect({
  options,
  noneLabel,
  current,
  ...props
}: TaskParentSelectProps) {
  const extra =
    current && current.value !== "" && !offers(options, current.value)
      ? current
      : null;
  return (
    <Select {...props}>
      <option value="">{noneLabel}</option>
      {extra && <option value={extra.value}>{extra.label}</option>}
      {options.map((goal) => {
        const goalLabel =
          goal.status === "paused" ? `${goal.title} (paused)` : goal.title;
        return (
          <optgroup key={goal.id} label={goalLabel}>
            <option value={`goal:${goal.id}`}>{goalLabel}</option>
            {goal.milestones.map((milestone) => (
              <option key={milestone.id} value={`milestone:${milestone.id}`}>
                {`${milestone.title} (milestone)`}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
