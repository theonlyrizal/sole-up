import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";

import { todayFor, type LocalDate, type WeekStart } from "@/lib/dates";
import { INSIGHT_KEYS, insightPeriod } from "@/lib/insights";
import { recordAudit } from "@/server/audit/record";
import { db } from "@/server/db/client";
import { insightDismissals } from "@/server/db/schema";
import { ConflictError } from "@/server/errors";
import { getUserPreferences } from "@/server/modules/preferences/service";

import type { dismissInsightSchema } from "./validation";

export async function dismissInsightForPeriod(
  userId: string,
  { key, start }: z.output<typeof dismissInsightSchema>,
  now = new Date(),
) {
  const { timezone, weekStart } = await getUserPreferences(userId);
  const period = insightPeriod(
    key,
    todayFor(timezone ?? "UTC", now),
    weekStart,
  );
  if (period.start !== start) {
    throw new ConflictError(
      "This insight’s period has changed. Refresh Insights and try again.",
    );
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(insightDismissals)
      .values({
        userId,
        insightKey: key,
        periodStart: period.start,
        periodEnd: period.end,
      })
      .onConflictDoNothing({
        target: [
          insightDismissals.userId,
          insightDismissals.insightKey,
          insightDismissals.periodStart,
        ],
      })
      .returning({ id: insightDismissals.id });
    if (row) {
      await recordAudit(tx, {
        userId,
        entityId: row.id,
        type: "insight_dismissal.created",
        changes: {
          insightKey: { from: null, to: key },
          periodStart: { from: null, to: period.start },
          periodEnd: { from: null, to: period.end },
        },
      });
    }
  });
}

export async function dismissedInsightKeys(
  userId: string,
  today: LocalDate,
  weekStart: WeekStart,
) {
  const periods = new Map(
    INSIGHT_KEYS.map((key) => [key, insightPeriod(key, today, weekStart)]),
  );
  const rows = await db
    .select({
      key: insightDismissals.insightKey,
      start: insightDismissals.periodStart,
    })
    .from(insightDismissals)
    .where(
      and(
        eq(insightDismissals.userId, userId),
        inArray(insightDismissals.periodStart, [
          ...new Set([...periods.values()].map(({ start }) => start)),
        ]),
      ),
    );
  return new Set(
    rows
      .filter(({ key, start }) => periods.get(key)?.start === start)
      .map(({ key }) => key),
  );
}
