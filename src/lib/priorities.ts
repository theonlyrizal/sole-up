// Priority values and labels shared by goals and tasks. Pure: no server-only
// imports. The scale comes from docs/decisions/0010-goal-status-priority-progress.md
// and ADR 0011 reuses it for tasks.

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
};
