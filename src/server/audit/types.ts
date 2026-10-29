import { z } from "zod";

import {
  CALENDAR_EVENT_EDITABLE_FIELDS,
  CALENDAR_EVENT_EXCEPTION_FIELDS,
  CALENDAR_EVENT_EXCEPTION_KINDS,
  CALENDAR_EVENT_SCOPES,
  CALENDAR_EVENT_SOURCES,
} from "@/lib/calendar-events";
import { isLocalDate } from "@/lib/dates";
import {
  GOAL_EDITABLE_FIELDS,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
} from "@/lib/goals";
import { anyCadenceConfigSchema } from "@/lib/habits/cadence";
import {
  HABIT_CADENCE_TYPES,
  HABIT_EDITABLE_FIELDS,
  HABIT_LOG_STATUSES,
  HABIT_MEASURES,
  HABIT_STATUSES,
} from "@/lib/habits/habit";
import { LIFE_AREA_COLORS, LIFE_AREA_STATUSES } from "@/lib/life-areas";
import {
  MILESTONE_EDITABLE_FIELDS,
  MILESTONE_STATUSES,
} from "@/lib/milestones";
import { NOTE_CONTENT_FIELDS, NOTE_LINK_TARGET_TYPES } from "@/lib/notes/note";
import { canonicalLocale, canonicalTimeZone } from "@/lib/preferences";
import { PRIORITIES } from "@/lib/priorities";
import { rruleSchema } from "@/lib/recurrence";
import { isReminderOffset, NUDGE_TIME_PATTERN } from "@/lib/reminders";
import {
  TASK_EDITABLE_FIELDS,
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_STATUSES,
} from "@/lib/tasks";
import {
  TIME_BLOCK_EDITABLE_FIELDS,
  TIME_BLOCK_EXCEPTION_FIELDS,
  TIME_BLOCK_EXCEPTION_KINDS,
  TIME_BLOCK_SCOPES,
  TIME_BLOCK_STATUSES,
} from "@/lib/time-blocks";
import { REVIEW_TEXT_FIELDS } from "@/lib/weekly-reviews";

// The audit event allowlist (ADR 0005). An event type that is not a key of
// AUDIT_EVENTS cannot be recorded.
//
// `changes` holds old and new values of structured fields only: status,
// dates, parent IDs, priority, ordering. Never titles, descriptions, note
// bodies, reasons or reflections. A schema here is the only thing standing
// between a service and the log, so:
//   - build every object with z.strictObject() (or auditChange()), so an
//     unexpected key is rejected instead of stripped or stored;
//   - store dates as ISO strings (`YYYY-MM-DD` for local dates, ISO 8601 UTC
//     for instants), because `changes` is JSON;
//   - never add a free-text field. A string field should be an enum, an ID
//     or a date.
// defineAuditEvents() enforces the first two when the module loads.

/** Event type names are `<entity_type>.<past-tense verb>`, e.g. `goal.archived`. */
export const AUDIT_EVENT_TYPE_PATTERN = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;

/** Entity type names are snake_case singular nouns, e.g. `life_area`. */
export const AUDIT_ENTITY_TYPE_PATTERN = /^[a-z][a-z_]*$/;

export type AuditEventDefinition = {
  entityType: string;
  changes: z.ZodObject;
};

export type AuditEventRegistry = Record<string, AuditEventDefinition>;

/**
 * A field's old and new value. Both are nullable: `from` is null when a value
 * is first set (or the entity is created), `to` when it is cleared.
 */
export function auditChange<T extends z.ZodType>(value: T) {
  return z.strictObject({ from: value.nullable(), to: value.nullable() });
}

// Schema kinds that can accept keys or values nobody listed.
const OPEN_SCHEMA_TYPES = new Set(["record", "map", "any", "unknown"]);

/**
 * Throws if `schema` can accept keys that are not declared (a non-strict
 * object, a record, `any`/`unknown`) or holds a `Date`. `path` names the
 * location in the error message.
 */
export function assertStrictAuditSchema(schema: z.ZodType, path: string): void {
  const def = schema._zod.def as z.core.$ZodTypeDef & Record<string, unknown>;

  if (OPEN_SCHEMA_TYPES.has(def.type)) {
    throw new Error(
      `${path}: ${def.type} schemas are not allowed in audit events`,
    );
  }
  if (def.type === "date") {
    throw new Error(`${path}: store dates as ISO strings, not Date`);
  }

  switch (def.type) {
    case "object": {
      const catchall = def.catchall as z.ZodType | undefined;
      if (catchall?._zod.def.type !== "never") {
        throw new Error(
          `${path}: use z.strictObject() so unknown keys are rejected`,
        );
      }
      const shape = def.shape as Record<string, z.ZodType>;
      for (const [key, field] of Object.entries(shape)) {
        assertStrictAuditSchema(field, `${path}.${key}`);
      }
      return;
    }
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
      assertStrictAuditSchema(def.innerType as z.ZodType, path);
      return;
    case "array":
      assertStrictAuditSchema(def.element as z.ZodType, `${path}[]`);
      return;
    case "union":
      for (const option of def.options as z.ZodType[]) {
        assertStrictAuditSchema(option, path);
      }
      return;
    case "pipe":
      assertStrictAuditSchema(def.in as z.ZodType, path);
      assertStrictAuditSchema(def.out as z.ZodType, path);
      return;
    default:
      // Scalars: string, number, boolean, enum, literal, null, transform...
      return;
  }
}

/**
 * Checks an event registry when the module loads: names follow the patterns
 * above and every `changes` schema is strict. Returns it unchanged, keeping
 * its literal types.
 */
export function defineAuditEvents<const R extends AuditEventRegistry>(
  registry: R,
): R {
  for (const [eventType, definition] of Object.entries(registry)) {
    if (!AUDIT_EVENT_TYPE_PATTERN.test(eventType)) {
      throw new Error(
        `Audit event type "${eventType}" must look like "entity.verb"`,
      );
    }
    if (!AUDIT_ENTITY_TYPE_PATTERN.test(definition.entityType)) {
      throw new Error(`Audit event "${eventType}" has an invalid entity type`);
    }
    if (!eventType.startsWith(`${definition.entityType}.`)) {
      throw new Error(
        `Audit event "${eventType}" must start with its entity type`,
      );
    }
    assertStrictAuditSchema(definition.changes, `${eventType}.changes`);
  }
  return registry;
}

const sortOrder = z.number().int().min(0);
const localDate = z.string().refine(isLocalDate);
/** A UTC instant as ISO 8601, e.g. "2027-03-12T14:00:00.000Z". */
const instant = z.iso.datetime();
const timeZone = z.string().refine((zone) => canonicalTimeZone(zone) === zone);
const estimate = z
  .number()
  .int()
  .min(TASK_ESTIMATE_MIN_MINUTES)
  .max(TASK_ESTIMATE_MAX_MINUTES);
const taskStatus = auditChange(z.enum(TASK_STATUSES));
/** A stored repeat rule: structured parts only, never free text (ADR 0012). */
const rrule = z.string().refine((rule) => rruleSchema.safeParse(rule).success);
const droppedExceptions = z.number().int().min(0);
/** Minutes before the target a reminder fires (ADR 0013). */
const reminderOffset = z.number().refine(isReminderOffset);
const nudgeTime = z.string().regex(NUDGE_TIME_PATTERN);
/**
 * A habit log on `localDate`: what it holds or changed by name (never the
 * amount itself), and its status before and after.
 */
const habitLogChange = z.strictObject({
  localDate,
  fields: z.array(z.enum(["status", "value"])).min(1),
  status: auditChange(z.enum(HABIT_LOG_STATUSES)),
});
/** One weekly review priority: the goal or task it links to, by ID. */
const noteLink = z.strictObject({
  targetType: z.enum(NOTE_LINK_TARGET_TYPES),
  targetId: z.uuid(),
});

const reviewPriority = z.union([
  z.strictObject({ goalId: z.uuid() }),
  z.strictObject({ taskId: z.uuid() }),
]);

/**
 * The allowlist. Add each new event here with its entity type and a strict
 * `changes` schema, for example:
 *
 *   "goal.archived": {
 *     entityType: "goal",
 *     changes: z.strictObject({ status: auditChange(z.enum(goalStatuses)) }),
 *   },
 */
export const AUDIT_EVENTS = defineAuditEvents({
  // A user's preferences changed. The entity ID is the user's ID (one row
  // per user). Only the fields that changed are present.
  "user_preferences.updated": {
    entityType: "user_preferences",
    changes: z.strictObject({
      timezone: auditChange(timeZone).optional(),
      locale: auditChange(
        z.string().refine((locale) => canonicalLocale(locale) === locale),
      ).optional(),
      weekStart: auditChange(z.number().int().min(0).max(6)).optional(),
      lifeAreaStarters: auditChange(
        z.enum(["accepted", "dismissed"]),
      ).optional(),
      dailyNudgeTime: auditChange(nudgeTime).optional(),
      remindersEnabled: auditChange(z.boolean()).optional(),
      remindersPrivate: auditChange(z.boolean()).optional(),
      quietHoursStart: auditChange(nudgeTime).optional(),
      quietHoursEnd: auditChange(nudgeTime).optional(),
      weeklyReviewDay: auditChange(z.number().int().min(0).max(6)).optional(),
      weeklyReviewTime: auditChange(nudgeTime).optional(),
    }),
  },

  // Life areas. Names and descriptions are user content: `life_area.updated`
  // records which fields changed, never their values.
  "life_area.created": {
    entityType: "life_area",
    changes: z.strictObject({
      status: auditChange(z.enum(LIFE_AREA_STATUSES)),
      sortOrder: auditChange(sortOrder),
      color: auditChange(z.enum(LIFE_AREA_COLORS)),
    }),
  },
  "life_area.updated": {
    entityType: "life_area",
    changes: z.strictObject({
      fields: z.array(z.enum(["name", "description", "color"])).min(1),
      color: auditChange(z.enum(LIFE_AREA_COLORS)).optional(),
    }),
  },
  "life_area.reordered": {
    entityType: "life_area",
    changes: z.strictObject({ sortOrder: auditChange(sortOrder) }),
  },
  "life_area.archived": {
    entityType: "life_area",
    changes: z.strictObject({
      status: auditChange(z.enum(LIFE_AREA_STATUSES)),
    }),
  },
  "life_area.unarchived": {
    entityType: "life_area",
    changes: z.strictObject({
      status: auditChange(z.enum(LIFE_AREA_STATUSES)),
      sortOrder: auditChange(sortOrder),
    }),
  },
  // No `life_area.deleted`: a hard delete removes the area's events with it
  // (ADR 0005).

  // Goals. Title, description and reason are user content: `goal.updated`
  // records which fields changed, plus old and new values for the
  // structured ones (area, priority, dates) only.
  "goal.created": {
    entityType: "goal",
    changes: z.strictObject({
      status: auditChange(z.enum(GOAL_STATUSES)),
      lifeAreaId: auditChange(z.uuid()),
      priority: auditChange(z.enum(GOAL_PRIORITIES)),
      startDate: auditChange(localDate),
      targetDate: auditChange(localDate),
    }),
  },
  "goal.updated": {
    entityType: "goal",
    changes: z.strictObject({
      fields: z.array(z.enum(GOAL_EDITABLE_FIELDS)).min(1),
      lifeAreaId: auditChange(z.uuid()).optional(),
      priority: auditChange(z.enum(GOAL_PRIORITIES)).optional(),
      startDate: auditChange(localDate).optional(),
      targetDate: auditChange(localDate).optional(),
    }),
  },
  "goal.status_changed": {
    entityType: "goal",
    changes: z.strictObject({ status: auditChange(z.enum(GOAL_STATUSES)) }),
  },
  // No `goal.deleted`, for the same reason as life areas (ADR 0005).

  // Milestones. Title and description are user content:
  // `milestone.updated` records which fields changed, plus old and new
  // values for the due date only. `milestone.created` names the parent goal.
  "milestone.created": {
    entityType: "milestone",
    changes: z.strictObject({
      goalId: auditChange(z.uuid()),
      status: auditChange(z.enum(MILESTONE_STATUSES)),
      sortOrder: auditChange(sortOrder),
      dueDate: auditChange(localDate),
    }),
  },
  "milestone.updated": {
    entityType: "milestone",
    changes: z.strictObject({
      fields: z.array(z.enum(MILESTONE_EDITABLE_FIELDS)).min(1),
      dueDate: auditChange(localDate).optional(),
    }),
  },
  "milestone.reordered": {
    entityType: "milestone",
    changes: z.strictObject({ sortOrder: auditChange(sortOrder) }),
  },
  "milestone.status_changed": {
    entityType: "milestone",
    changes: z.strictObject({
      status: auditChange(z.enum(MILESTONE_STATUSES)),
    }),
  },
  // No `milestone.deleted`, for the same reason as life areas (ADR 0005).

  // Tasks (ADR 0011). Title and notes are user content: `task.updated`
  // records which fields changed, plus old and new values for priority and
  // estimate only. Plan, deadline and parent changes have their own events,
  // which reschedule history and planned-versus-completed metrics read.
  "task.created": {
    entityType: "task",
    changes: z.strictObject({
      status: taskStatus,
      goalId: auditChange(z.uuid()),
      milestoneId: auditChange(z.uuid()),
      priority: auditChange(z.enum(PRIORITIES)),
      estimatedMinutes: auditChange(estimate),
      plannedDate: auditChange(localDate),
      dueDate: auditChange(localDate),
      dueAt: auditChange(instant),
      dueTz: auditChange(timeZone),
      // Present only when the task was created with a reminder.
      reminderOffsetMinutes: auditChange(reminderOffset).optional(),
    }),
  },
  "task.updated": {
    entityType: "task",
    changes: z.strictObject({
      fields: z.array(z.enum(TASK_EDITABLE_FIELDS)).min(1),
      priority: auditChange(z.enum(PRIORITIES)).optional(),
      estimatedMinutes: auditChange(estimate).optional(),
    }),
  },
  "task.completed": {
    entityType: "task",
    changes: z.strictObject({ status: taskStatus }),
  },
  "task.reopened": {
    entityType: "task",
    changes: z.strictObject({ status: taskStatus }),
  },
  "task.cancelled": {
    entityType: "task",
    changes: z.strictObject({ status: taskStatus }),
  },
  "task.planned": {
    entityType: "task",
    changes: z.strictObject({ plannedDate: auditChange(localDate) }),
  },
  // All three deadline columns, so a switch between an all-day and a timed
  // deadline is one event.
  "task.due_changed": {
    entityType: "task",
    changes: z.strictObject({
      dueDate: auditChange(localDate),
      dueAt: auditChange(instant),
      dueTz: auditChange(timeZone),
    }),
  },
  "task.moved": {
    entityType: "task",
    changes: z.strictObject({
      goalId: auditChange(z.uuid()),
      milestoneId: auditChange(z.uuid()),
    }),
  },
  "task.reminder_changed": {
    entityType: "task",
    changes: z.strictObject({
      reminderOffsetMinutes: auditChange(reminderOffset),
    }),
  },
  // No `task.deleted`, for the same reason as life areas (ADR 0005).

  // Calendar events (ADR 0012). Title, description and location are user
  // content: `calendar_event.updated` records which fields changed, plus
  // old and new values for the shape, times, dates, rule and links only.
  // A change to a series through a scope records the scope; a "this and
  // following" split links the ended series and the new one by ID and
  // counts the exceptions it dropped.
  "calendar_event.created": {
    entityType: "calendar_event",
    changes: z.strictObject({
      allDay: auditChange(z.boolean()),
      startAt: auditChange(instant),
      endAt: auditChange(instant),
      tz: auditChange(timeZone),
      startDate: auditChange(localDate),
      endDate: auditChange(localDate),
      rrule: auditChange(rrule),
      goalId: auditChange(z.uuid()),
      lifeAreaId: auditChange(z.uuid()),
      source: auditChange(z.enum(CALENDAR_EVENT_SOURCES)),
      // Present only when the event was created with a reminder.
      reminderOffsetMinutes: auditChange(reminderOffset).optional(),
      scope: z.literal("following").optional(),
      splitFromId: z.uuid().optional(),
    }),
  },
  "calendar_event.updated": {
    entityType: "calendar_event",
    changes: z.strictObject({
      fields: z.array(z.enum(CALENDAR_EVENT_EDITABLE_FIELDS)).min(1),
      allDay: auditChange(z.boolean()).optional(),
      startAt: auditChange(instant).optional(),
      endAt: auditChange(instant).optional(),
      tz: auditChange(timeZone).optional(),
      startDate: auditChange(localDate).optional(),
      endDate: auditChange(localDate).optional(),
      rrule: auditChange(rrule).optional(),
      goalId: auditChange(z.uuid()).optional(),
      lifeAreaId: auditChange(z.uuid()).optional(),
      reminderOffsetMinutes: auditChange(reminderOffset).optional(),
      scope: z.enum(["following", "all"]).optional(),
      splitIntoId: z.uuid().optional(),
      droppedExceptions: droppedExceptions.optional(),
    }),
  },
  // No `calendar_event.deleted`, for the same reason as life areas (ADR 0005).

  // One occurrence of a series that differs from its rule. Text fields are
  // named, never stored. `.updated` records the scope it came from: "this"
  // for an edit or delete of the occurrence itself, "following" or "all"
  // when a series change carried it over (a new series, a new original
  // start, or values it shared with the series).
  "calendar_event_exception.created": {
    entityType: "calendar_event_exception",
    changes: z.strictObject({
      eventId: auditChange(z.uuid()),
      originalStartAt: auditChange(instant),
      originalStartDate: auditChange(localDate),
      kind: auditChange(z.enum(CALENDAR_EVENT_EXCEPTION_KINDS)),
      startAt: auditChange(instant),
      endAt: auditChange(instant),
      startDate: auditChange(localDate),
      endDate: auditChange(localDate),
      goalId: auditChange(z.uuid()),
      lifeAreaId: auditChange(z.uuid()),
    }),
  },
  "calendar_event_exception.updated": {
    entityType: "calendar_event_exception",
    changes: z.strictObject({
      fields: z.array(z.enum(CALENDAR_EVENT_EXCEPTION_FIELDS)).min(1),
      scope: z.enum(CALENDAR_EVENT_SCOPES),
      eventId: auditChange(z.uuid()).optional(),
      originalStartAt: auditChange(instant).optional(),
      originalStartDate: auditChange(localDate).optional(),
      kind: auditChange(z.enum(CALENDAR_EVENT_EXCEPTION_KINDS)).optional(),
      startAt: auditChange(instant).optional(),
      endAt: auditChange(instant).optional(),
      startDate: auditChange(localDate).optional(),
      endDate: auditChange(localDate).optional(),
      goalId: auditChange(z.uuid()).optional(),
      lifeAreaId: auditChange(z.uuid()).optional(),
    }),
  },
  // No `calendar_event_exception.deleted`: an exception dropped by a series
  // change or deleted with its series takes its events with it (ADR 0005);
  // the series' event counts the dropped ones.

  // Time blocks (ADR 0012). A block has no text of its own (it shows its
  // task's title), so every field is structured. Series changes record
  // their scope as calendar events do. A status change that completing the
  // task made, rather than the user, carries `automatic: true`.
  "time_block.created": {
    entityType: "time_block",
    changes: z.strictObject({
      taskId: auditChange(z.uuid()),
      startAt: auditChange(instant),
      endAt: auditChange(instant),
      tz: auditChange(timeZone),
      rrule: auditChange(rrule),
      status: auditChange(z.enum(TIME_BLOCK_STATUSES)),
      scope: z.literal("following").optional(),
      splitFromId: z.uuid().optional(),
    }),
  },
  "time_block.updated": {
    entityType: "time_block",
    changes: z.strictObject({
      fields: z.array(z.enum(TIME_BLOCK_EDITABLE_FIELDS)).min(1),
      startAt: auditChange(instant).optional(),
      endAt: auditChange(instant).optional(),
      tz: auditChange(timeZone).optional(),
      rrule: auditChange(rrule).optional(),
      status: auditChange(z.enum(TIME_BLOCK_STATUSES)).optional(),
      scope: z.enum(["following", "all"]).optional(),
      splitIntoId: z.uuid().optional(),
      droppedExceptions: droppedExceptions.optional(),
    }),
  },
  // A one-off block's status, set by the user or by completing its task.
  "time_block.status_changed": {
    entityType: "time_block",
    changes: z.strictObject({
      status: auditChange(z.enum(TIME_BLOCK_STATUSES)),
      automatic: z.literal(true).optional(),
    }),
  },
  // No `time_block.deleted`, for the same reason as life areas (ADR 0005).

  // One occurrence of a repeating block that differs from its rule: moved,
  // cancelled, or given a status. `.updated` records the scope a series
  // change carried it over with; a status change has no scope.
  "time_block_exception.created": {
    entityType: "time_block_exception",
    changes: z.strictObject({
      blockId: auditChange(z.uuid()),
      originalStartAt: auditChange(instant),
      kind: auditChange(z.enum(TIME_BLOCK_EXCEPTION_KINDS)),
      startAt: auditChange(instant),
      endAt: auditChange(instant),
      status: auditChange(z.enum(TIME_BLOCK_STATUSES)),
      automatic: z.literal(true).optional(),
    }),
  },
  "time_block_exception.updated": {
    entityType: "time_block_exception",
    changes: z.strictObject({
      fields: z.array(z.enum(TIME_BLOCK_EXCEPTION_FIELDS)).min(1),
      scope: z.enum(TIME_BLOCK_SCOPES).optional(),
      blockId: auditChange(z.uuid()).optional(),
      originalStartAt: auditChange(instant).optional(),
      kind: auditChange(z.enum(TIME_BLOCK_EXCEPTION_KINDS)).optional(),
      startAt: auditChange(instant).optional(),
      endAt: auditChange(instant).optional(),
      status: auditChange(z.enum(TIME_BLOCK_STATUSES)).optional(),
      automatic: z.literal(true).optional(),
    }),
  },
  // No `time_block_exception.deleted`, as for event exceptions.

  // Habits (ADR 0014). Title, description, unit and note are user content,
  // and target and value amounts can be health data: events name a changed
  // target, never its number. `habit.updated` records which fields changed,
  // plus old and new values for the dates and the goal link only.
  "habit.created": {
    entityType: "habit",
    changes: z.strictObject({
      status: auditChange(z.enum(HABIT_STATUSES)),
      measure: auditChange(z.enum(HABIT_MEASURES)),
      startDate: auditChange(localDate),
      endDate: auditChange(localDate),
      goalId: auditChange(z.uuid()),
      effectiveFrom: localDate,
      cadenceType: auditChange(z.enum(HABIT_CADENCE_TYPES)),
      cadenceConfig: auditChange(anyCadenceConfigSchema),
    }),
  },
  "habit.updated": {
    entityType: "habit",
    changes: z.strictObject({
      fields: z.array(z.enum(HABIT_EDITABLE_FIELDS)).min(1),
      startDate: auditChange(localDate).optional(),
      endDate: auditChange(localDate).optional(),
      goalId: auditChange(z.uuid()).optional(),
    }),
  },
  "habit.status_changed": {
    entityType: "habit",
    changes: z.strictObject({ status: auditChange(z.enum(HABIT_STATUSES)) }),
  },
  // The schedule in effect for the week of `effectiveFrom` before and after
  // the edit. A changed target appears in `fields` by name only.
  "habit.schedule_changed": {
    entityType: "habit",
    changes: z.strictObject({
      effectiveFrom: localDate,
      fields: z
        .array(z.enum(["cadenceType", "cadenceConfig", "target"]))
        .min(1),
      cadenceType: auditChange(z.enum(HABIT_CADENCE_TYPES)),
      cadenceConfig: auditChange(anyCadenceConfigSchema),
    }),
  },
  // No `habit.deleted`, for the same reason as life areas (ADR 0005).

  // A habit's log on one local date, recorded on the habit so its history
  // outlives the log row (undo deletes it). `fields` names what the log
  // holds (`logged`, `log_removed`) or what changed (`log_changed`): a
  // value appears by name only, and the note never does.
  "habit.logged": {
    entityType: "habit",
    changes: habitLogChange,
  },
  "habit.log_changed": {
    entityType: "habit",
    changes: habitLogChange,
  },
  "habit.log_removed": {
    entityType: "habit",
    changes: habitLogChange,
  },

  // Weekly reviews (ADR 0015). Wins, blockers, lessons and the priorities
  // note are reflections: `weekly_review.updated` names the changed fields
  // only. Priorities are ordered goal and task IDs, never their titles.
  "weekly_review.started": {
    entityType: "weekly_review",
    changes: z.strictObject({
      periodStart: auditChange(localDate),
      periodEnd: auditChange(localDate),
    }),
  },
  "weekly_review.updated": {
    entityType: "weekly_review",
    changes: z.strictObject({
      fields: z.array(z.enum(REVIEW_TEXT_FIELDS)).min(1),
    }),
  },
  "weekly_review.priorities_changed": {
    entityType: "weekly_review",
    changes: z.strictObject({
      priorities: auditChange(z.array(reviewPriority)),
    }),
  },
  "weekly_review.finished": {
    entityType: "weekly_review",
    changes: z.strictObject({ completedAt: auditChange(instant) }),
  },
  // No `weekly_review.deleted`: a deleted review's events go with it.

  // Notes (ADR 0016). The title, body and body text are user content:
  // `note.created` and `note.updated` name the content fields only.
  // `note.updated` marks an editing session: the service records none
  // within 10 minutes of the note's latest one. Links are a target type and
  // ID, never a goal or task title.
  "note.created": {
    entityType: "note",
    changes: z.strictObject({
      fields: z.array(z.enum(NOTE_CONTENT_FIELDS)).min(1),
    }),
  },
  "note.updated": {
    entityType: "note",
    changes: z.strictObject({
      fields: z.array(z.enum(NOTE_CONTENT_FIELDS)).min(1),
    }),
  },
  "note.archived": {
    entityType: "note",
    changes: z.strictObject({ archivedAt: auditChange(instant) }),
  },
  "note.restored": {
    entityType: "note",
    changes: z.strictObject({ archivedAt: auditChange(instant) }),
  },
  "note.linked": {
    entityType: "note",
    changes: noteLink,
  },
  "note.unlinked": {
    entityType: "note",
    changes: noteLink,
  },
  // No `note.deleted`: a deleted note's events go with it.
});

export type AuditEvents = typeof AUDIT_EVENTS;
