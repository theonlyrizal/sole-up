import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { db } from "@/server/db/client";
import { auditEvents, users } from "@/server/db/schema";

import { createTestUser } from "../../../tests/integration/helpers/users";
import {
  InvalidAuditEventError,
  createAuditLog,
  recordAudit as appRecordAudit,
} from "./record";
import { auditChange, defineAuditEvents } from "./types";

// The app's allowlist is empty until 0.11, so these tests use their own
// registry with the same writer.
const testEvents = defineAuditEvents({
  "probe.archived": {
    entityType: "probe",
    changes: z.strictObject({
      status: auditChange(z.enum(["active", "archived"])),
    }),
  },
  "probe.moved": {
    entityType: "probe",
    changes: z.strictObject({
      parentId: auditChange(z.uuid()),
      sortOrder: auditChange(z.number().int()).optional(),
    }),
  },
});

const { recordAudit, deleteAuditEventsForEntity } = createAuditLog(testEvents);

const archived = { status: { from: "active", to: "archived" } } as const;

class RollbackProbe extends Error {}

async function eventsFor(userId: string) {
  return db.select().from(auditEvents).where(eq(auditEvents.userId, userId));
}

describe("recordAudit", () => {
  it("writes a valid event with its registry entity type", async () => {
    const user = await createTestUser();
    const entityId = randomUUID();

    await db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId,
        changes: archived,
      }),
    );

    const rows = await eventsFor(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventType: "probe.archived",
      entityType: "probe",
      entityId,
      changes: archived,
    });
    expect(rows[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it("rejects an event type that is not in the allowlist", async () => {
    const user = await createTestUser();

    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.renamed",
        userId: user.id,
        entityId: randomUUID(),
        changes: {},
      } as never),
    );

    await expect(write).rejects.toThrow(InvalidAuditEventError);
    await expect(write).rejects.toThrow("Unknown audit event type");
    expect(await eventsFor(user.id)).toHaveLength(0);
  });

  it("rejects inherited object keys as event types", async () => {
    const user = await createTestUser();
    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "toString",
        userId: user.id,
        entityId: randomUUID(),
        changes: {},
      } as never),
    );
    await expect(write).rejects.toThrow("Unknown audit event type");
  });

  it("rejects the app's allowlist for any type while it is empty", async () => {
    const user = await createTestUser();
    const write = db.transaction((tx) =>
      appRecordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: archived,
      } as never),
    );
    await expect(write).rejects.toThrow("Unknown audit event type");
  });

  it("rejects an extra field in changes and stores nothing", async () => {
    const user = await createTestUser();

    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: { ...archived, title: "My private goal" },
      } as never),
    );

    await expect(write).rejects.toThrow(InvalidAuditEventError);
    await expect(write).rejects.toThrow(/unrecognized_keys \[title\]/);
    // The message names the key, never the value.
    await expect(write).rejects.not.toThrow(/My private goal/);
    expect(await eventsFor(user.id)).toHaveLength(0);
  });

  it("rejects an extra field nested inside a change", async () => {
    const user = await createTestUser();
    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: { status: { from: "active", to: "archived", note: "why" } },
      } as never),
    );
    await expect(write).rejects.toThrow(/status: unrecognized_keys \[note\]/);
  });

  it("rejects an extra field on the event itself", async () => {
    const user = await createTestUser();
    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: archived,
        description: "private",
      } as never),
    );
    await expect(write).rejects.toThrow(/unrecognized_keys \[description\]/);
  });

  it.each([
    ["a missing required change", { sortOrder: { from: 1, to: 2 } }],
    ["a wrong value type", { parentId: { from: null, to: "not-a-uuid" } }],
  ])("rejects %s", async (_case, changes) => {
    const user = await createTestUser();
    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.moved",
        userId: user.id,
        entityId: randomUUID(),
        changes,
      } as never),
    );
    await expect(write).rejects.toThrow(
      /Invalid changes for audit event "probe.moved"/,
    );
  });

  it("rejects an entity ID that is not a UUID", async () => {
    const user = await createTestUser();
    const write = db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: "42",
        changes: archived,
      }),
    );
    await expect(write).rejects.toThrow(/entityId: invalid_format/);
  });

  it("rolls back with its transaction", async () => {
    const user = await createTestUser();

    const write = db.transaction(async (tx) => {
      await recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: archived,
      });
      // A later step in the same change fails.
      throw new RollbackProbe();
    });

    await expect(write).rejects.toThrow(RollbackProbe);
    expect(await eventsFor(user.id)).toHaveLength(0);
  });

  it("rolls back the state change when the event is rejected", async () => {
    const user = await createTestUser();

    const write = db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ name: "Changed" })
        .where(eq(users.id, user.id));
      await recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: { status: { from: "active", to: "deleted" } },
      } as never);
    });

    await expect(write).rejects.toThrow(InvalidAuditEventError);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.name).toBe(user.name);
  });

  it("is removed when the user's account is deleted", async () => {
    const user = await createTestUser();
    await db.transaction((tx) =>
      recordAudit(tx, {
        type: "probe.archived",
        userId: user.id,
        entityId: randomUUID(),
        changes: archived,
      }),
    );

    await db.delete(users).where(eq(users.id, user.id));
    expect(await eventsFor(user.id)).toHaveLength(0);
  });
});

describe("deleteAuditEventsForEntity", () => {
  async function seed(userId: string, entityId: string) {
    await db.transaction(async (tx) => {
      await recordAudit(tx, {
        type: "probe.archived",
        userId,
        entityId,
        changes: archived,
      });
      await recordAudit(tx, {
        type: "probe.moved",
        userId,
        entityId,
        changes: { parentId: { from: null, to: randomUUID() } },
      });
    });
  }

  it("deletes only that entity's events for that user", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const target = randomUUID();
    const sibling = randomUUID();
    await seed(owner.id, target);
    await seed(owner.id, sibling);
    // Same entity ID under another user: must survive.
    await seed(other.id, target);

    const deleted = await db.transaction((tx) =>
      deleteAuditEventsForEntity(tx, {
        userId: owner.id,
        entityType: "probe",
        entityId: target,
      }),
    );

    expect(deleted).toBe(2);
    const ownerRows = await eventsFor(owner.id);
    expect(ownerRows.map((row) => row.entityId)).toEqual([sibling, sibling]);
    expect(await eventsFor(other.id)).toHaveLength(2);
  });

  it("rolls back with its transaction", async () => {
    const user = await createTestUser();
    const entityId = randomUUID();
    await seed(user.id, entityId);

    const remove = db.transaction(async (tx) => {
      await deleteAuditEventsForEntity(tx, {
        userId: user.id,
        entityType: "probe",
        entityId,
      });
      // The entity's own delete fails, so its history must come back.
      throw new RollbackProbe();
    });

    await expect(remove).rejects.toThrow(RollbackProbe);
    expect(await eventsFor(user.id)).toHaveLength(2);
  });

  it("rejects an entity type that is not in the allowlist", async () => {
    const user = await createTestUser();
    const remove = db.transaction((tx) =>
      deleteAuditEventsForEntity(tx, {
        userId: user.id,
        entityType: "goal" as never,
        entityId: randomUUID(),
      }),
    );
    await expect(remove).rejects.toThrow("Unknown audit entity type");
  });
});
