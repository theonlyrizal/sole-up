import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AUDIT_EVENTS,
  assertStrictAuditSchema,
  auditChange,
  defineAuditEvents,
} from "./types";

describe("assertStrictAuditSchema", () => {
  it("accepts strict objects of scalars, enums, arrays and auditChange()", () => {
    const schema = z.strictObject({
      status: auditChange(z.enum(["active", "archived"])),
      dueDate: auditChange(z.iso.date()).optional(),
      sortOrder: auditChange(z.number().int()),
      tagIds: z.array(z.uuid()).default([]),
      parent: z.union([z.null(), z.strictObject({ goalId: z.uuid() })]),
    });
    expect(() => assertStrictAuditSchema(schema, "x")).not.toThrow();
  });

  it.each([
    ["a non-strict object", z.object({ a: z.string() }), /strictObject/],
    ["a loose object", z.looseObject({}), /strictObject/],
    [
      "a nested non-strict object",
      z.strictObject({ a: z.object({ b: z.number() }).optional() }),
      /x\.a: use z\.strictObject/,
    ],
    [
      "a non-strict object in an array",
      z.strictObject({ a: z.array(z.object({})) }),
      /x\.a\[\]/,
    ],
    [
      "a record",
      z.strictObject({ a: z.record(z.string(), z.string()) }),
      /record/,
    ],
    ["unknown", z.strictObject({ a: z.unknown() }), /unknown/],
    ["any", z.strictObject({ a: z.any() }), /any/],
    ["a Date", z.strictObject({ a: auditChange(z.date()) }), /ISO strings/],
  ])("rejects %s", (_case, schema, message) => {
    expect(() => assertStrictAuditSchema(schema, "x")).toThrow(message);
  });
});

describe("defineAuditEvents", () => {
  const changes = z.strictObject({ status: auditChange(z.string()) });

  it("returns a valid registry unchanged", () => {
    const registry = { "goal.archived": { entityType: "goal", changes } };
    expect(defineAuditEvents(registry)).toBe(registry);
  });

  it.each([
    ["a type without a verb", { goal: { entityType: "goal", changes } }],
    ["an uppercase type", { "Goal.Archived": { entityType: "goal", changes } }],
    [
      "a mismatched entity type",
      { "goal.archived": { entityType: "task", changes } },
    ],
    [
      "an invalid entity type",
      { "goal.archived": { entityType: "Goal", changes } },
    ],
    [
      "a non-strict changes schema",
      { "goal.archived": { entityType: "goal", changes: z.object({}) } },
    ],
  ])("rejects %s", (_case, registry) => {
    expect(() => defineAuditEvents(registry)).toThrow();
  });

  it("accepts the app's allowlist", () => {
    // AUDIT_EVENTS runs defineAuditEvents() on import; this documents that
    // importing it did not throw.
    expect(AUDIT_EVENTS).toBeTypeOf("object");
  });
});
