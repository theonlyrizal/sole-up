import { formatInstant, formatLocalDate } from "@/lib/dates";
import {
  GOAL_STATUS_LABELS,
  type GoalEditableField,
  type GoalPriority,
  type GoalStatus,
} from "@/lib/goals";
import { AUDIT_EVENTS } from "@/server/audit/types";

// Turns a goal's audit events into the history timeline on its detail page
// (chunk 1.3). Events hold structured fields only (ADR 0005), so the
// timeline can say what kind of thing changed (status, dates, priority,
// area, which text fields were edited) but never what the text said.
// Area names are looked up from the user's current areas at read time.

/** One audit event as read from `audit_events`. */
export type GoalAuditEvent = {
  id: string;
  eventType: string;
  occurredAt: Date;
  changes: unknown;
};

/** One line of the timeline, newest first. */
export type GoalHistoryEntry = {
  id: string;
  occurredAt: Date;
  /** `occurredAt` in the user's locale and time zone. */
  occurredAtLabel: string;
  summary: string;
  details: string[];
};

export type GoalHistoryContext = {
  locale: string;
  timeZone: string;
  /** The user's area names by ID; a missing ID was deleted. */
  areaNames: ReadonlyMap<string, string>;
};

const PRIORITY_NAMES: Record<GoalPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// Text fields: the timeline names them, never their contents.
const TEXT_FIELD_NAMES: Partial<Record<GoalEditableField, string>> = {
  title: "title",
  description: "description",
  reason: "why it matters",
};

/** What a status change is called, from the goal's point of view. */
export function statusChangeSummary(from: GoalStatus, to: GoalStatus): string {
  if (from === "archived") return "Restored from the archive";
  switch (to) {
    case "active":
      return from === "paused" ? "Resumed" : "Reopened";
    case "paused":
      return "Paused";
    case "completed":
      return "Marked complete";
    case "dropped":
      return "Dropped";
    case "archived":
      return "Archived";
  }
}

function describe(
  event: GoalAuditEvent,
  context: GoalHistoryContext,
): { summary: string; details: string[] } {
  const date = (value: string | null) =>
    value ? formatLocalDate(value, context.locale) : "Not set";
  const area = (id: string | null) =>
    id === null ? "No area" : (context.areaNames.get(id) ?? "A deleted area");
  const priority = (value: GoalPriority | null) =>
    value ? PRIORITY_NAMES[value] : "None";

  switch (event.eventType) {
    case "goal.created": {
      const parsed = AUDIT_EVENTS["goal.created"].changes.safeParse(
        event.changes,
      );
      if (!parsed.success) break;
      const {
        lifeAreaId,
        priority: level,
        startDate,
        targetDate,
      } = parsed.data;
      const details = [
        lifeAreaId.to && `Area: ${area(lifeAreaId.to)}`,
        level.to && `Priority: ${priority(level.to)}`,
        startDate.to && `Start date: ${date(startDate.to)}`,
        targetDate.to && `Target date: ${date(targetDate.to)}`,
      ].filter((detail): detail is string => Boolean(detail));
      return { summary: "Created", details };
    }
    case "goal.status_changed": {
      const parsed = AUDIT_EVENTS["goal.status_changed"].changes.safeParse(
        event.changes,
      );
      if (!parsed.success) break;
      const { from, to } = parsed.data.status;
      if (from === null || to === null) break;
      return {
        summary: statusChangeSummary(from, to),
        details: [`${GOAL_STATUS_LABELS[from]} → ${GOAL_STATUS_LABELS[to]}`],
      };
    }
    case "goal.updated": {
      const parsed = AUDIT_EVENTS["goal.updated"].changes.safeParse(
        event.changes,
      );
      if (!parsed.success) break;
      const changes = parsed.data;
      const details: string[] = [];
      if (changes.lifeAreaId) {
        details.push(
          `Area: ${area(changes.lifeAreaId.from)} → ${area(changes.lifeAreaId.to)}`,
        );
      }
      if (changes.priority) {
        details.push(
          `Priority: ${priority(changes.priority.from)} → ${priority(changes.priority.to)}`,
        );
      }
      if (changes.startDate) {
        details.push(
          `Start date: ${date(changes.startDate.from)} → ${date(changes.startDate.to)}`,
        );
      }
      if (changes.targetDate) {
        details.push(
          `Target date: ${date(changes.targetDate.from)} → ${date(changes.targetDate.to)}`,
        );
      }
      const edited = changes.fields
        .map((field) => TEXT_FIELD_NAMES[field])
        .filter((name): name is string => Boolean(name));
      if (edited.length > 0) details.push(`Edited the ${joinNames(edited)}`);
      return { summary: "Edited", details };
    }
  }
  // An event this code doesn't recognise (or that no longer parses) still
  // shows that something happened, with no details to get wrong.
  return { summary: "Changed", details: [] };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The timeline for a goal's events, newest first. */
export function buildGoalHistory(
  events: readonly GoalAuditEvent[],
  context: GoalHistoryContext,
): GoalHistoryEntry[] {
  return [...events]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      occurredAtLabel: formatInstant(
        event.occurredAt,
        context.locale,
        context.timeZone,
      ),
      ...describe(event, context),
    }));
}
