import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { createGoal } from "../../modules/goals/service";
import { createGoalSchema } from "../../modules/goals/validation";
import { createMilestone } from "../../modules/milestones/service";
import { createMilestoneSchema } from "../../modules/milestones/validation";
import { deleteMilestone } from "../../modules/milestones/service";
import { db } from "../client";
import { tasks } from "./tasks";
import { deleteGoal } from "../../modules/goals/service";

type TaskInsert = typeof tasks.$inferInsert;

type DriverError = { cause?: { code?: string; constraint?: string } };

/** Runs the insert and returns the database error it raised, if any. */
async function insertError(values: TaskInsert): Promise<DriverError | null> {
  try {
    await db.insert(tasks).values(values);
    return null;
  } catch (error: unknown) {
    return error as DriverError;
  }
}

async function expectCheck(values: TaskInsert, constraint: string) {
  expect(await insertError(values)).toMatchObject({
    cause: { code: "23514", constraint },
  });
}

async function expectForeignKey(values: TaskInsert, constraint: string) {
  expect(await insertError(values)).toMatchObject({
    cause: { code: "23503", constraint },
  });
}

async function seedGoalAndMilestone(userId: string) {
  const goal = await createGoal(
    userId,
    createGoalSchema.parse({ title: "Run a 10k" }),
  );
  const milestone = await createMilestone(
    userId,
    createMilestoneSchema.parse({ goalId: goal.id, title: "Run 5k" }),
  );
  return { goal, milestone };
}

describe("tasks schema", () => {
  it("accepts a task with only a title and applies the defaults", async () => {
    const user = await createTestUser();

    await db.insert(tasks).values({ userId: user.id, title: "Buy stamps" });

    const [row] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, user.id));
    expect(row).toMatchObject({
      status: "open",
      sortOrder: 0,
      goalId: null,
      milestoneId: null,
      completedAt: null,
      cancelledAt: null,
    });
  });

  it("allows at most one parent (goal or milestone)", async () => {
    const user = await createTestUser();
    const { goal, milestone } = await seedGoalAndMilestone(user.id);

    await expectCheck(
      {
        userId: user.id,
        title: "Two parents",
        goalId: goal.id,
        milestoneId: milestone.id,
      },
      "tasks_parent_check",
    );
  });

  it("allows a deadline as a date or as an instant with a zone, not both", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Deadline" };

    await expectCheck(
      {
        ...base,
        dueDate: "2026-11-01",
        dueAt: new Date("2026-11-01T09:00:00Z"),
        dueTz: "Europe/London",
      },
      "tasks_deadline_check",
    );
    await expectCheck(
      { ...base, dueAt: new Date("2026-11-01T09:00:00Z") },
      "tasks_due_tz_check",
    );
    await expectCheck(
      { ...base, dueTz: "Europe/London" },
      "tasks_due_tz_check",
    );

    await db.insert(tasks).values({
      ...base,
      dueDate: "2026-11-01",
    });
    await db.insert(tasks).values({
      ...base,
      dueAt: new Date("2026-11-01T09:00:00Z"),
      dueTz: "Europe/London",
    });
  });

  it("rejects an unknown status or priority", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Ok" };

    await expectCheck(
      { ...base, status: "in_progress" as TaskInsert["status"] },
      "tasks_status_check",
    );
    await expectCheck(
      { ...base, priority: "urgent" as TaskInsert["priority"] },
      "tasks_priority_check",
    );
  });

  it("limits estimates to whole minutes from 1 to 1440", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Estimate" };

    await expectCheck(
      { ...base, estimatedMinutes: 0 },
      "tasks_estimated_minutes_check",
    );
    await expectCheck(
      { ...base, estimatedMinutes: 1441 },
      "tasks_estimated_minutes_check",
    );

    await db.insert(tasks).values({ ...base, estimatedMinutes: 1 });
    await db.insert(tasks).values({ ...base, estimatedMinutes: 1440 });
  });

  it("sets completed_at exactly while completed", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Done?" };

    await expectCheck(
      { ...base, status: "completed" },
      "tasks_completed_at_check",
    );
    await expectCheck(
      { ...base, completedAt: new Date() },
      "tasks_completed_at_check",
    );

    await db.insert(tasks).values({
      ...base,
      status: "completed",
      completedAt: new Date(),
    });
  });

  it("sets cancelled_at exactly while cancelled", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Dropped?" };

    await expectCheck(
      { ...base, status: "cancelled" },
      "tasks_cancelled_at_check",
    );
    await expectCheck(
      { ...base, cancelledAt: new Date() },
      "tasks_cancelled_at_check",
    );
    await expectCheck(
      {
        ...base,
        status: "completed",
        completedAt: new Date(),
        cancelledAt: new Date(),
      },
      "tasks_cancelled_at_check",
    );

    await db.insert(tasks).values({
      ...base,
      status: "cancelled",
      cancelledAt: new Date(),
    });
  });

  it("checks sort order, title and notes length", async () => {
    const user = await createTestUser();
    const base = { userId: user.id, title: "Ok" };

    await expectCheck({ ...base, sortOrder: -1 }, "tasks_sort_order_check");
    await expectCheck({ ...base, title: "" }, "tasks_title_length_check");
    await expectCheck(
      { ...base, title: "x".repeat(201) },
      "tasks_title_length_check",
    );
    await expectCheck({ ...base, notes: "" }, "tasks_notes_length_check");
    await expectCheck(
      { ...base, notes: "x".repeat(2001) },
      "tasks_notes_length_check",
    );
  });

  it("rejects a goal or milestone that belongs to another user", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const { goal, milestone } = await seedGoalAndMilestone(alice.id);

    await expectForeignKey(
      { userId: bob.id, title: "Sneaky", goalId: goal.id },
      "tasks_goal_id_user_id_fk",
    );
    await expectForeignKey(
      { userId: bob.id, title: "Sneaky", milestoneId: milestone.id },
      "tasks_milestone_id_user_id_fk",
    );
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("clears milestone_id when the milestone is deleted and keeps user_id", async () => {
    const user = await createTestUser();
    const { milestone } = await seedGoalAndMilestone(user.id);
    const [task] = await db
      .insert(tasks)
      .values({
        userId: user.id,
        title: "Under milestone",
        milestoneId: milestone.id,
      })
      .returning();

    await deleteMilestone(user.id, { id: milestone.id });

    const [kept] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(kept).toMatchObject({
      title: "Under milestone",
      userId: user.id,
      milestoneId: null,
    });
  });

  it("clears goal_id when the goal is deleted and keeps user_id", async () => {
    const user = await createTestUser();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Read more" }),
    );
    const [task] = await db
      .insert(tasks)
      .values({ userId: user.id, title: "Direct under goal", goalId: goal.id })
      .returning();

    await deleteGoal(user.id, { id: goal.id });

    const [kept] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(kept).toMatchObject({
      title: "Direct under goal",
      userId: user.id,
      goalId: null,
    });
  });
});
