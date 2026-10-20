import { z } from "zod";

import { canonicalLocale, canonicalTimeZone } from "@/lib/preferences";

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
      timezone: auditChange(
        z.string().refine((zone) => canonicalTimeZone(zone) === zone),
      ).optional(),
      locale: auditChange(
        z.string().refine((locale) => canonicalLocale(locale) === locale),
      ).optional(),
      weekStart: auditChange(z.number().int().min(0).max(6)).optional(),
    }),
  },
});

export type AuditEvents = typeof AUDIT_EVENTS;
