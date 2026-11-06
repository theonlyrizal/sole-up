import "server-only";

import { and, eq, getTableColumns, getTableName, gt } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { NoteDocument } from "@/lib/notes/document";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { activeAccount } from "@/server/modules/account-deletion/status";

import { noteMarkdown } from "./markdown";

const PAGE_SIZE = 32;

type OwnedTable = PgTable & { userId: PgColumn };
type ExportTable = {
  table: PgTable;
  owner: PgColumn;
  key: PgColumn;
  fields: Record<string, PgColumn>;
};

function owned(
  table: OwnedTable,
  fields: Record<string, PgColumn> = getTableColumns(table),
) {
  const key = getTableColumns(table).id ?? table.userId;
  return { table, owner: table.userId, key, fields };
}

// Review each new table before exporting it. For credential-bearing tables,
// select metadata explicitly so a future secret column stays private.
const { accounts, sessions, pushSubscriptions, users, notes } = schema;
const tables: ExportTable[] = [
  {
    table: users,
    owner: users.id,
    key: users.id,
    fields: getTableColumns(users),
  },
  owned(accounts, {
    id: accounts.id,
    userId: accounts.userId,
    accountId: accounts.accountId,
    providerId: accounts.providerId,
    scope: accounts.scope,
    accessTokenExpiresAt: accounts.accessTokenExpiresAt,
    refreshTokenExpiresAt: accounts.refreshTokenExpiresAt,
    createdAt: accounts.createdAt,
    updatedAt: accounts.updatedAt,
  }),
  owned(sessions, {
    id: sessions.id,
    userId: sessions.userId,
    expiresAt: sessions.expiresAt,
    ipAddress: sessions.ipAddress,
    userAgent: sessions.userAgent,
    createdAt: sessions.createdAt,
    updatedAt: sessions.updatedAt,
  }),
  owned(pushSubscriptions, {
    id: pushSubscriptions.id,
    userId: pushSubscriptions.userId,
    userAgentLabel: pushSubscriptions.userAgentLabel,
    createdAt: pushSubscriptions.createdAt,
    lastSuccessAt: pushSubscriptions.lastSuccessAt,
    failedCount: pushSubscriptions.failedCount,
  }),
  owned(schema.auditEvents),
  owned(schema.calendarEvents),
  owned(schema.calendarEventExceptions),
  owned(schema.goals),
  owned(schema.habits),
  owned(schema.habitLogs),
  owned(schema.habitPauses),
  owned(schema.habitSchedules),
  owned(schema.insightDismissals),
  owned(schema.lifeAreas),
  owned(schema.milestones),
  owned(notes),
  owned(schema.noteGoals),
  owned(schema.noteTags),
  owned(schema.noteTasks),
  owned(schema.reminders),
  owned(schema.tags),
  owned(schema.tasks),
  owned(schema.timeBlocks),
  owned(schema.timeBlockExceptions),
  owned(schema.userPreferences),
  owned(schema.weeklyReviews),
  owned(schema.weeklyReviewPriorities),
];

export async function* archiveChunks(userId: string, exportedAt: Date) {
  yield `{"version":1,"exportedAt":${JSON.stringify(exportedAt)},"tables":{`;
  let tableSeparator = "\n";
  for (const { table, owner, key, fields } of tables) {
    yield `${tableSeparator}${JSON.stringify(getTableName(table))}:[`;
    tableSeparator = ",\n";
    let after: string | undefined;
    let rowSeparator = "\n";
    // Keyset pagination keeps memory bounded and releases the connection
    // between reads, including when the browser slows or cancels the download.
    while (true) {
      const rows = await db
        .select(fields)
        .from(table)
        .where(
          and(
            eq(owner, userId),
            activeAccount(owner),
            after ? gt(key, after) : undefined,
          ),
        )
        .orderBy(key)
        .limit(PAGE_SIZE);
      for (const row of rows) {
        const entry =
          table === notes
            ? { ...row, markdown: noteMarkdown(row.body as NoteDocument) }
            : row;
        yield rowSeparator + JSON.stringify(entry);
        rowSeparator = ",\n";
      }
      if (rows.length < PAGE_SIZE) break;
      const last = rows[rows.length - 1];
      after = (last.id ?? last.userId) as string;
    }
    yield rowSeparator === ",\n" ? "\n]" : "]";
  }
  yield "\n}}\n";
}
