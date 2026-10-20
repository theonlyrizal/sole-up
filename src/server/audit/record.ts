import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { DbTransaction } from "@/server/db/client";
import { auditEvents } from "@/server/db/schema";

import {
  AUDIT_EVENTS,
  type AuditEventRegistry,
  type AuditEvents,
} from "./types";

/** One event to record: its allowlisted type and that type's `changes`. */
export type AuditEventInput<R extends AuditEventRegistry> = {
  [T in keyof R & string]: {
    type: T;
    userId: string;
    entityId: string;
    changes: z.input<R[T]["changes"]>;
  };
}[keyof R & string];

/** Identifies one entity's events for deleteAuditEventsForEntity(). */
export type AuditEntityRef<R extends AuditEventRegistry> = {
  userId: string;
  entityType: R[keyof R]["entityType"];
  entityId: string;
};

/**
 * A rejected audit event. This is a programming error, not a domain error:
 * it rolls back the caller's transaction, and authedAction() reports it as
 * INTERNAL. The message names the event type and the failing paths and Zod
 * issue codes only, never the values, so it is safe to log.
 */
export class InvalidAuditEventError extends Error {
  override readonly name = "InvalidAuditEventError";
}

const envelopeSchema = z.strictObject({
  type: z.string(),
  userId: z.uuid(),
  entityId: z.uuid(),
  changes: z.unknown(),
});

function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      const keys =
        issue.code === "unrecognized_keys" ? ` [${issue.keys.join(", ")}]` : "";
      return `${path}: ${issue.code}${keys}`;
    })
    .join("; ");
}

/**
 * Builds the audit writer for a registry. The app uses the instance exported
 * below; tests build their own with a test registry.
 */
export function createAuditLog<R extends AuditEventRegistry>(registry: R) {
  const knownEntityTypes = new Set(
    Object.values(registry).map((definition) => definition.entityType),
  );

  /**
   * Validates `event` and inserts it inside `tx`, the transaction that makes
   * the change being recorded, so both commit or roll back together. Throws
   * InvalidAuditEventError for an unknown type, a malformed envelope, or a
   * `changes` payload that fails its schema (including any extra key).
   */
  async function recordAudit(
    tx: DbTransaction,
    event: AuditEventInput<R>,
  ): Promise<void> {
    const envelope = envelopeSchema.safeParse(event);
    if (!envelope.success) {
      throw new InvalidAuditEventError(
        `Invalid audit event: ${describeIssues(envelope.error.issues)}`,
      );
    }

    const { type, userId, entityId } = envelope.data;
    if (!Object.hasOwn(registry, type)) {
      // Don't echo the value: it came from the caller, not the allowlist.
      throw new InvalidAuditEventError("Unknown audit event type");
    }
    const definition = registry[type]!;

    const changes = definition.changes.safeParse(envelope.data.changes);
    if (!changes.success) {
      throw new InvalidAuditEventError(
        `Invalid changes for audit event "${type}": ${describeIssues(changes.error.issues)}`,
      );
    }

    await tx.insert(auditEvents).values({
      userId,
      eventType: type,
      entityType: definition.entityType,
      entityId,
      changes: changes.data,
    });
  }

  /**
   * Deletes every event for one entity of one user. Hard deletes call this
   * inside the transaction that deletes the entity: `entity_id` has no
   * foreign key, so nothing cascades. Returns the number of events deleted.
   */
  async function deleteAuditEventsForEntity(
    tx: DbTransaction,
    ref: AuditEntityRef<R>,
  ): Promise<number> {
    if (!knownEntityTypes.has(ref.entityType)) {
      throw new InvalidAuditEventError("Unknown audit entity type");
    }
    const ids = z.strictObject({ userId: z.uuid(), entityId: z.uuid() });
    const parsed = ids.safeParse({
      userId: ref.userId,
      entityId: ref.entityId,
    });
    if (!parsed.success) {
      throw new InvalidAuditEventError(
        `Invalid audit entity reference: ${describeIssues(parsed.error.issues)}`,
      );
    }

    const deleted = await tx
      .delete(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, parsed.data.userId),
          eq(auditEvents.entityType, ref.entityType),
          eq(auditEvents.entityId, parsed.data.entityId),
        ),
      )
      .returning({ id: auditEvents.id });
    return deleted.length;
  }

  return { recordAudit, deleteAuditEventsForEntity };
}

export const { recordAudit, deleteAuditEventsForEntity } =
  createAuditLog<AuditEvents>(AUDIT_EVENTS);
