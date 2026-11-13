import type { IconName } from "@/components/icons/icon";
import { Chip } from "@/components/ui/chip";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/goals";
import type { HabitStatus } from "@/lib/habits/habit";
import { TASK_STATUS_LABELS } from "@/lib/task-list";
import type { TaskStatus } from "@/lib/tasks";

type Status = GoalStatus | TaskStatus | HabitStatus;
type Tone = NonNullable<
  Extract<React.ComponentProps<typeof Chip>, { type: "status" }>["tone"]
>;

const appearances: Record<Status, { icon: IconName; tone: Tone }> = {
  active: { icon: "radio_button_unchecked", tone: "active" },
  open: { icon: "radio_button_unchecked", tone: "neutral" },
  completed: { icon: "check_circle", tone: "success" },
  paused: { icon: "pause", tone: "inactive" },
  dropped: { icon: "block", tone: "inactive" },
  cancelled: { icon: "close", tone: "inactive" },
  archived: { icon: "archive", tone: "inactive" },
};

const labels = { ...GOAL_STATUS_LABELS, ...TASK_STATUS_LABELS };

export function StatusChip({ status }: { status: Status }) {
  return <Chip type="status" label={labels[status]} {...appearances[status]} />;
}
