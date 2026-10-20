import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { LifeArea } from "@/lib/life-areas";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import { isUniqueViolation } from "@/server/db/errors";
import { lifeAreas } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { answerLifeAreaStarters } from "@/server/modules/preferences/service";

import type {
  AddStarterLifeAreasInput,
  CreateLifeAreaInput,
  LifeAreaIdInput,
  ReorderLifeAreasInput,
  UpdateLifeAreaInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A record
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction.

const ACTIVE_NAME_KEY = "life_areas_user_id_active_name_key";
const DUPLICATE_NAME = "You already have an active area with this name.";

type LifeAreaRow = typeof lifeAreas.$inferSelect;

export function toLifeArea(row: LifeAreaRow): LifeArea {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    status: row.status,
  };
}

/** Locks one of the user's areas for the rest of the transaction. */
async function findForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
): Promise<LifeAreaRow> {
  const [row] = await tx
    .select()
    .from(lifeAreas)
    .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
    .for("update");
  if (!row) throw new NotFoundError();
  return row;
}

/** The position after the user's last area (archived ones included). */
async function nextSortOrder(tx: DbTransaction, userId: string) {
  const [result] = await tx
    .select({
      next: sql<number>`coalesce(max(${lifeAreas.sortOrder}) + 1, 0)::int`,
    })
    .from(lifeAreas)
    .where(eq(lifeAreas.userId, userId));
  return result?.next ?? 0;
}

/** Runs `write`, turning a duplicate active name into `error`. */
async function guardDuplicateName<T>(
  write: () => Promise<T>,
  error: () => Error,
): Promise<T> {
  try {
    return await write();
  } catch (cause) {
    if (isUniqueViolation(cause, ACTIVE_NAME_KEY)) throw error();
    throw cause;
  }
}

const duplicateNameField = () =>
  new ValidationError({ name: [DUPLICATE_NAME] });

async function insertArea(
  tx: DbTransaction,
  userId: string,
  input: CreateLifeAreaInput,
): Promise<LifeAreaRow> {
  const sortOrder = await nextSortOrder(tx, userId);
  const [row] = await tx
    .insert(lifeAreas)
    .values({ ...input, userId, sortOrder })
    .returning();
  if (!row) throw new Error("Life area insert returned no row");

  await recordAudit(tx, {
    type: "life_area.created",
    userId,
    entityId: row.id,
    changes: {
      status: { from: null, to: row.status },
      sortOrder: { from: null, to: row.sortOrder },
      color: { from: null, to: row.color },
    },
  });
  return row;
}

export async function createLifeArea(
  userId: string,
  input: CreateLifeAreaInput,
): Promise<LifeArea> {
  const row = await guardDuplicateName(
    () => db.transaction((tx) => insertArea(tx, userId, input)),
    duplicateNameField,
  );
  return toLifeArea(row);
}

/** Edits name, description and color. Records which fields changed. */
export async function updateLifeArea(
  userId: string,
  { id, ...input }: UpdateLifeAreaInput,
): Promise<LifeArea> {
  const row = await guardDuplicateName(
    () =>
      db.transaction(async (tx) => {
        const current = await findForUpdate(tx, userId, id);
        const fields = (["name", "description", "color"] as const).filter(
          (field) => current[field] !== input[field],
        );
        if (fields.length === 0) return current;

        const [updated] = await tx
          .update(lifeAreas)
          .set(input)
          .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
          .returning();
        if (!updated) throw new NotFoundError();

        await recordAudit(tx, {
          type: "life_area.updated",
          userId,
          entityId: id,
          changes: {
            fields,
            ...(fields.includes("color") && {
              color: { from: current.color, to: updated.color },
            }),
          },
        });
        return updated;
      }),
    duplicateNameField,
  );
  return toLifeArea(row);
}

/**
 * Puts the user's active areas in the given order. `ids` must be exactly
 * their active areas; otherwise the list is stale (another tab changed it)
 * and nothing moves. Archived areas keep their positions.
 */
export async function reorderLifeAreas(
  userId: string,
  { ids }: ReorderLifeAreasInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: lifeAreas.id, sortOrder: lifeAreas.sortOrder })
      .from(lifeAreas)
      .where(and(eq(lifeAreas.userId, userId), eq(lifeAreas.status, "active")))
      .for("update");

    const current = new Map(active.map((row) => [row.id, row.sortOrder]));
    if (ids.length !== current.size || !ids.every((id) => current.has(id))) {
      throw new ConflictError(
        "Your areas changed since this page loaded. Reload and try again.",
      );
    }

    for (const [sortOrder, id] of ids.entries()) {
      const from = current.get(id)!;
      if (from === sortOrder) continue;
      await tx
        .update(lifeAreas)
        .set({ sortOrder })
        .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)));
      await recordAudit(tx, {
        type: "life_area.reordered",
        userId,
        entityId: id,
        changes: { sortOrder: { from, to: sortOrder } },
      });
    }
  });
}

export async function archiveLifeArea(
  userId: string,
  { id }: LifeAreaIdInput,
): Promise<LifeArea> {
  return db.transaction(async (tx) => {
    const current = await findForUpdate(tx, userId, id);
    if (current.status === "archived") return toLifeArea(current);

    const [updated] = await tx
      .update(lifeAreas)
      .set({ status: "archived" })
      .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "life_area.archived",
      userId,
      entityId: id,
      changes: { status: { from: "active", to: "archived" } },
    });
    return toLifeArea(updated);
  });
}

/** Restores an archived area to the end of the active list. */
export async function unarchiveLifeArea(
  userId: string,
  { id }: LifeAreaIdInput,
): Promise<LifeArea> {
  const row = await guardDuplicateName(
    () =>
      db.transaction(async (tx) => {
        const current = await findForUpdate(tx, userId, id);
        if (current.status === "active") return current;

        const sortOrder = await nextSortOrder(tx, userId);
        const [updated] = await tx
          .update(lifeAreas)
          .set({ status: "active", sortOrder })
          .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
          .returning();
        if (!updated) throw new NotFoundError();

        await recordAudit(tx, {
          type: "life_area.unarchived",
          userId,
          entityId: id,
          changes: {
            status: { from: "archived", to: "active" },
            sortOrder: { from: current.sortOrder, to: sortOrder },
          },
        });
        return updated;
      }),
    () =>
      new ConflictError(
        "You already have an active area with this name. Rename one of them first.",
      ),
  );
  return toLifeArea(row);
}

/** Hard delete (ADR 0006). Removes the area's audit events with it. */
export async function deleteLifeArea(
  userId: string,
  { id }: LifeAreaIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(lifeAreas)
      .where(and(eq(lifeAreas.id, id), eq(lifeAreas.userId, userId)))
      .returning({ id: lifeAreas.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "life_area",
      entityId: id,
    });
  });
}

/**
 * Accepts the one-time starter offer, creating the chosen areas. A name the
 * user already has (ignoring case) is skipped. Refused once the offer has
 * been answered, so a double submit can't add a second set.
 */
export async function addStarterLifeAreas(
  userId: string,
  { names }: AddStarterLifeAreasInput,
): Promise<LifeArea[]> {
  return db.transaction(async (tx) => {
    if (!(await answerLifeAreaStarters(tx, userId, "accepted"))) {
      throw new ConflictError("You've already answered this suggestion.");
    }

    const created: LifeArea[] = [];
    for (const name of names) {
      // A savepoint, so a skipped duplicate doesn't abort the transaction.
      const row = await tx
        .transaction((savepoint) =>
          insertArea(savepoint, userId, {
            name,
            description: null,
            color: null,
          }),
        )
        .catch((error: unknown) => {
          if (isUniqueViolation(error, ACTIVE_NAME_KEY)) return null;
          throw error;
        });
      if (row) created.push(toLifeArea(row));
    }
    return created;
  });
}

/** Declines the starter offer. Answering twice is harmless. */
export async function dismissStarterLifeAreas(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await answerLifeAreaStarters(tx, userId, "dismissed");
  });
}
