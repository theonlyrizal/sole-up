import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { todayFor, type LocalDate, type WeekStart } from "@/lib/dates";
import {
  isReviewOpen,
  openPeriodStarts,
  priorityKey,
  REVIEW_CLOSED,
  REVIEW_PERIOD_NOT_OPEN,
  REVIEW_TEXT_FIELDS,
  type ReviewPriority,
  type WeeklyReview,
} from "@/lib/weekly-reviews";
import { deleteAuditEventsForEntity, recordAudit } from "@/server/audit/record";
import { db, type DbTransaction } from "@/server/db/client";
import {
  goals,
  tasks,
  weeklyReviewPriorities,
  weeklyReviews,
} from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { reviewPeriod } from "@/server/modules/metrics/review";
import { getUserPreferences } from "@/server/modules/preferences/service";

import {
  PRIORITY_NOT_AVAILABLE,
  type SaveWeeklyReviewTextInput,
  type SetWeeklyReviewPrioritiesInput,
  type StartWeeklyReviewInput,
  type WeeklyReviewIdInput,
} from "./validation";

// Every function takes the user's ID and scopes each query by it. A review
// that is missing or belongs to someone else is the same NotFoundError.
// Each mutation writes its audit event in the same transaction, and a no-op
// writes none. Review text never goes into an event or a log.
// Rules: ADR 0015. Every write but delete locks the review row and refuses
// a closed period, so a write racing the closing day can't slip through.

type ReviewRow = typeof weeklyReviews.$inferSelect;

export function toWeeklyReview(row: ReviewRow): WeeklyReview {
  return {
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    wins: row.wins,
    blockers: row.blockers,
    lessons: row.lessons,
    prioritiesNote: row.prioritiesNote,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The user's local today and week start, as the open-period rule uses. */
async function userCalendar(
  userId: string,
  now: Date,
): Promise<{ today: LocalDate; weekStart: WeekStart }> {
  const preferences = await getUserPreferences(userId);
  return {
    today: todayFor(preferences.timezone ?? "UTC", now),
    weekStart: preferences.weekStart,
  };
}

const ownReview = (userId: string, id: string) =>
  and(eq(weeklyReviews.id, id), eq(weeklyReviews.userId, userId));

/**
 * Locks one of the user's reviews for the rest of the transaction, and
 * refuses it with a ConflictError once its period has closed.
 */
async function findOpenForUpdate(
  tx: DbTransaction,
  userId: string,
  id: string,
  today: LocalDate,
): Promise<ReviewRow> {
  const [row] = await tx
    .select()
    .from(weeklyReviews)
    .where(ownReview(userId, id))
    .for("update");
  if (!row) throw new NotFoundError();
  if (!isReviewOpen(row.periodEnd, today)) {
    throw new ConflictError(REVIEW_CLOSED);
  }
  return row;
}

/**
 * Returns the review of the period starting `periodStart`, creating it if
 * there is none. The period must be this week's or last week's under the
 * current week start: a future, older or misaligned start is refused.
 */
export async function startWeeklyReview(
  userId: string,
  { periodStart }: StartWeeklyReviewInput,
  now: Date = new Date(),
): Promise<WeeklyReview> {
  const { today, weekStart } = await userCalendar(userId, now);
  const { thisWeek, lastWeek } = openPeriodStarts(today, weekStart);
  if (periodStart !== thisWeek && periodStart !== lastWeek) {
    throw new ValidationError(
      { periodStart: [REVIEW_PERIOD_NOT_OPEN] },
      REVIEW_PERIOD_NOT_OPEN,
    );
  }
  const period = reviewPeriod(periodStart);

  const row = await db.transaction(async (tx) => {
    // A concurrent start of the same period inserts nothing here and reads
    // the other one's row below.
    const [created] = await tx
      .insert(weeklyReviews)
      .values({ userId, periodStart: period.start, periodEnd: period.end })
      .onConflictDoNothing({
        target: [weeklyReviews.userId, weeklyReviews.periodStart],
      })
      .returning();
    if (!created) {
      const [existing] = await tx
        .select()
        .from(weeklyReviews)
        .where(
          and(
            eq(weeklyReviews.userId, userId),
            eq(weeklyReviews.periodStart, period.start),
          ),
        );
      if (!existing) throw new Error("Weekly review vanished after conflict");
      return existing;
    }

    await recordAudit(tx, {
      type: "weekly_review.started",
      userId,
      entityId: created.id,
      changes: {
        periodStart: { from: null, to: created.periodStart },
        periodEnd: { from: null, to: created.periodEnd },
      },
    });
    return created;
  });
  return toWeeklyReview(row);
}

/**
 * Writes any of the four text fields; a field left out keeps its value.
 * Records which fields changed, by name only.
 */
export async function saveWeeklyReviewText(
  userId: string,
  { id, ...input }: SaveWeeklyReviewTextInput,
  now: Date = new Date(),
): Promise<WeeklyReview> {
  const { today } = await userCalendar(userId, now);

  const row = await db.transaction(async (tx) => {
    const current = await findOpenForUpdate(tx, userId, id, today);
    const fields = REVIEW_TEXT_FIELDS.filter(
      (field) => input[field] !== undefined && input[field] !== current[field],
    );
    if (fields.length === 0) return current;

    const [updated] = await tx
      .update(weeklyReviews)
      .set(Object.fromEntries(fields.map((field) => [field, input[field]])))
      .where(ownReview(userId, id))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "weekly_review.updated",
      userId,
      entityId: id,
      changes: { fields },
    });
    return updated;
  });
  return toWeeklyReview(row);
}

/** A review's priorities in order. */
async function prioritiesOf(
  tx: DbTransaction,
  userId: string,
  reviewId: string,
): Promise<ReviewPriority[]> {
  const rows = await tx
    .select({
      goalId: weeklyReviewPriorities.goalId,
      taskId: weeklyReviewPriorities.taskId,
    })
    .from(weeklyReviewPriorities)
    .where(
      and(
        eq(weeklyReviewPriorities.reviewId, reviewId),
        eq(weeklyReviewPriorities.userId, userId),
      ),
    )
    .orderBy(asc(weeklyReviewPriorities.sortOrder));
  return rows.map(({ goalId, taskId }) =>
    goalId ? { goalId } : { taskId: taskId! },
  );
}

/**
 * Throws unless every goal and task newly added is the user's own and is an
 * active or paused goal or an open task. Ones already linked stay allowed
 * whatever their status now, so a later completed goal can stay in a
 * reordered list (ADR 0015 "Structure").
 */
async function assertAddable(
  tx: DbTransaction,
  userId: string,
  added: ReviewPriority[],
): Promise<void> {
  const goalIds = added.flatMap((p) => ("goalId" in p ? [p.goalId] : []));
  const taskIds = added.flatMap((p) => ("taskId" in p ? [p.taskId] : []));

  const foundGoals = goalIds.length
    ? await tx
        .select({ id: goals.id })
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            inArray(goals.id, goalIds),
            inArray(goals.status, ["active", "paused"]),
          ),
        )
    : [];
  const foundTasks = taskIds.length
    ? await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            inArray(tasks.id, taskIds),
            eq(tasks.status, "open"),
          ),
        )
    : [];

  if (
    foundGoals.length !== goalIds.length ||
    foundTasks.length !== taskIds.length
  ) {
    throw new ValidationError(
      { priorities: [PRIORITY_NOT_AVAILABLE] },
      PRIORITY_NOT_AVAILABLE,
    );
  }
}

/**
 * Replaces the review's priorities with `priorities`, in order, with a
 * dense `sort_order` from 0. The same list again is a no-op with no event.
 */
export async function setWeeklyReviewPriorities(
  userId: string,
  { id, priorities }: SetWeeklyReviewPrioritiesInput,
  now: Date = new Date(),
): Promise<ReviewPriority[]> {
  const { today } = await userCalendar(userId, now);

  return db.transaction(async (tx) => {
    await findOpenForUpdate(tx, userId, id, today);
    const current = await prioritiesOf(tx, userId, id);
    const currentKeys = current.map(priorityKey);
    if (currentKeys.join() === priorities.map(priorityKey).join()) {
      return current;
    }

    const linked = new Set(currentKeys);
    await assertAddable(
      tx,
      userId,
      priorities.filter((priority) => !linked.has(priorityKey(priority))),
    );

    await tx
      .delete(weeklyReviewPriorities)
      .where(
        and(
          eq(weeklyReviewPriorities.reviewId, id),
          eq(weeklyReviewPriorities.userId, userId),
        ),
      );
    if (priorities.length > 0) {
      await tx.insert(weeklyReviewPriorities).values(
        priorities.map((priority, sortOrder) => ({
          userId,
          reviewId: id,
          goalId: "goalId" in priority ? priority.goalId : null,
          taskId: "taskId" in priority ? priority.taskId : null,
          sortOrder,
        })),
      );
    }

    await recordAudit(tx, {
      type: "weekly_review.priorities_changed",
      userId,
      entityId: id,
      changes: { priorities: { from: current, to: priorities } },
    });
    return priorities;
  });
}

/**
 * Sets `completed_at` the first time. Nothing has to be filled. Finishing
 * again is a no-op with no event, and keeps the first instant.
 */
export async function finishWeeklyReview(
  userId: string,
  { id }: WeeklyReviewIdInput,
  now: Date = new Date(),
): Promise<WeeklyReview> {
  const { today } = await userCalendar(userId, now);

  const row = await db.transaction(async (tx) => {
    const current = await findOpenForUpdate(tx, userId, id, today);
    if (current.completedAt) return current;

    const [updated] = await tx
      .update(weeklyReviews)
      .set({ completedAt: now })
      .where(ownReview(userId, id))
      .returning();
    if (!updated) throw new NotFoundError();

    await recordAudit(tx, {
      type: "weekly_review.finished",
      userId,
      entityId: id,
      changes: { completedAt: { from: null, to: now.toISOString() } },
    });
    return updated;
  });
  return toWeeklyReview(row);
}

/**
 * Hard delete (ADR 0006), allowed whether the period is open or closed. Its
 * priorities go by cascade; its audit events are removed here.
 */
export async function deleteWeeklyReview(
  userId: string,
  { id }: WeeklyReviewIdInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(weeklyReviews)
      .where(ownReview(userId, id))
      .returning({ id: weeklyReviews.id });
    if (!deleted) throw new NotFoundError();

    await deleteAuditEventsForEntity(tx, {
      userId,
      entityType: "weekly_review",
      entityId: id,
    });
  });
}
