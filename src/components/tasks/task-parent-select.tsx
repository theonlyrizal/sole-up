import { Select } from "@/components/ui/select";
import type { TaskParentOption } from "@/server/modules/tasks/queries";

type TaskParentSelectProps = Omit<
  React.ComponentProps<typeof Select>,
  "children"
> & {
  options: TaskParentOption[];
  /** The label of the "" option. */
  noneLabel: string;
};

/**
 * Picks a goal or one of its open milestones. Values are TaskParentChoice
 * strings; turn them back into IDs with `parentFromChoice`.
 */
export function TaskParentSelect({
  options,
  noneLabel,
  ...props
}: TaskParentSelectProps) {
  return (
    <Select {...props}>
      <option value="">{noneLabel}</option>
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
