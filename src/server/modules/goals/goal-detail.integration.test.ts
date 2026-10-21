import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";
import { createLifeArea } from "@/server/modules/life-areas/service";
import { getUserPreferences } from "@/server/modules/preferences/service";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { getGoalDetail } from "./queries";
import { changeGoalStatus, createGoal, updateGoal } from "./service";
import { createGoalSchema, updateGoalSchema } from "./validation";

// The goal detail page's read model (chunk 1.3).

async function userInLondon() {
  const user = await createTestUser();
  await getUserPreferences(user.id); // creates the preferences row
  await db
    .update(userPreferences)
    .set({ locale: "en-GB", timezone: "Europe/London" })
    .where(eq(userPreferences.userId, user.id));
  return user;
}

const summaries = (detail: Awaited<ReturnType<typeof getGoalDetail>>) =>
  detail!.history.map((entry) => entry.summary);

describe("getGoalDetail", () => {
  it("returns the goal with its area and formatted dates", async () => {
    const user = await userInLondon();
    const area = await createLifeArea(user.id, {
      name: "Health",
      description: null,
      color: "green",
    });
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({
        title: "Run a half marathon",
        reason: "I want to feel strong again.",
        lifeAreaId: area.id,
        priority: "high",
        startDate: "2027-01-01",
        targetDate: "2027-03-12",
      }),
    );

    const detail = await getGoalDetail(user.id, goal.id);

    expect(detail).toMatchObject({
      goal: {
        id: goal.id,
        title: "Run a half marathon",
        reason: "I want to feel strong again.",
        status: "active",
        priority: "high",
        startDateLabel: "1 Jan 2027",
        targetDateLabel: "12 Mar 2027",
        completedAtLabel: null,
      },
      area: { id: area.id, name: "Health" },
      areas: [{ id: area.id }],
    });
    expect(detail!.history).toHaveLength(1);
    expect(detail!.history[0]).toMatchObject({
      summary: "Created",
      details: [
        "Area: Health",
        "Priority: High",
        "Start date: 1 Jan 2027",
        "Target date: 12 Mar 2027",
      ],
    });
  });

  it("is null for a missing goal or another user's", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const hers = await createGoal(
      alice.id,
      createGoalSchema.parse({ title: "Alice's goal" }),
    );

    expect(await getGoalDetail(bob.id, hers.id)).toBeNull();
    expect(
      await getGoalDetail(alice.id, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await getGoalDetail(alice.id, hers.id)).not.toBeNull();
  });

  it("shows every status change newest first, including archive and restore", async () => {
    const user = await userInLondon();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Learn Spanish" }),
    );
    for (const status of [
      "paused",
      "active",
      "completed",
      "archived",
      "active",
      "dropped",
      "dropped", // the same status again is a no-op, with no event
    ] as const) {
      await changeGoalStatus(user.id, { id: goal.id, status });
    }

    const detail = await getGoalDetail(user.id, goal.id);

    expect(summaries(detail)).toEqual([
      "Dropped",
      "Restored from the archive",
      "Archived",
      "Marked complete",
      "Resumed",
      "Paused",
      "Created",
    ]);
    expect(detail!.history.map((entry) => entry.details)).toEqual([
      ["Active → Dropped"],
      ["Archived → Active"],
      ["Completed → Archived"],
      ["Active → Completed"],
      ["Paused → Active"],
      ["Active → Paused"],
      [],
    ]);
    const times = detail!.history.map((entry) => entry.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(detail!.goal.status).toBe("dropped");
  });

  it("shows when a completed goal was completed, as a date in the user's zone", async () => {
    const user = await userInLondon();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Finish the course" }),
    );
    const completed = await changeGoalStatus(user.id, {
      id: goal.id,
      status: "completed",
    });

    const detail = await getGoalDetail(user.id, goal.id);

    const expected = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "Europe/London",
    }).format(completed.completedAt!);
    expect(detail!.goal.completedAtLabel).toBe(expected);
  });

  it("shows edits to dates and priority, and never the text that was written", async () => {
    const user = await userInLondon();
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Old title", reason: "Old reason" }),
    );
    await updateGoal(
      user.id,
      updateGoalSchema.parse({
        id: goal.id,
        title: "New secret title",
        reason: "A very private reason",
        priority: "low",
        targetDate: "2027-06-30",
      }),
    );

    const detail = await getGoalDetail(user.id, goal.id);

    expect(detail!.history[0]).toMatchObject({
      summary: "Edited",
      details: [
        "Priority: None → Low",
        "Target date: Not set → 30 Jun 2027",
        "Edited the title and why it matters",
      ],
    });
    const historyText = JSON.stringify(detail!.history);
    for (const text of ["Old title", "Old reason", "secret", "private"]) {
      expect(historyText).not.toContain(text);
    }
  });
});
