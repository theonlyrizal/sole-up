import { describe, expect, it } from "vitest";

import { getGoalDetail, getGoalsView } from "@/server/modules/goals/queries";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";

import { milestoneProgressLabel } from "@/lib/milestones";
import { createTestUser } from "../../../../tests/integration/helpers/users";
import { listMilestones } from "./queries";
import { changeMilestoneStatus, createMilestone } from "./service";
import { createMilestoneSchema } from "./validation";

// The read models behind the milestone list and the progress shown on the
// goal page and the goals list (chunk 1.5).

async function goalWithMilestones(
  userId: string,
  statuses: ("open" | "completed" | "dropped")[],
) {
  const goal = await createGoal(
    userId,
    createGoalSchema.parse({ title: "Run a 10k" }),
  );
  for (const [index, status] of statuses.entries()) {
    const milestone = await createMilestone(
      userId,
      createMilestoneSchema.parse({
        goalId: goal.id,
        title: `Step ${index + 1}`,
      }),
    );
    if (status !== "open") {
      await changeMilestoneStatus(userId, { id: milestone.id, status });
    }
  }
  return goal;
}

describe("milestone progress on the goal page", () => {
  it("is null with no milestones, so nothing is shown", async () => {
    const user = await createTestUser();
    const goal = await goalWithMilestones(user.id, []);

    const detail = await getGoalDetail(user.id, goal.id);
    expect(detail?.milestones).toEqual([]);
    expect(detail?.progress).toBeNull();
  });

  it("counts nothing when every milestone is dropped", async () => {
    const user = await createTestUser();
    const goal = await goalWithMilestones(user.id, ["dropped", "dropped"]);

    const detail = await getGoalDetail(user.id, goal.id);
    expect(detail?.milestones).toHaveLength(2);
    expect(detail?.progress).toEqual({ completed: 0, countable: 0 });
    expect(milestoneProgressLabel(detail!.progress)).toBeNull();
  });

  it("counts completed out of non-dropped, and lists in order", async () => {
    const user = await createTestUser();
    const goal = await goalWithMilestones(user.id, [
      "completed",
      "open",
      "dropped",
      "completed",
    ]);

    const detail = await getGoalDetail(user.id, goal.id);
    expect(detail?.progress).toEqual({ completed: 2, countable: 3 });
    expect(detail?.milestones.map((m) => m.title)).toEqual([
      "Step 1",
      "Step 2",
      "Step 3",
      "Step 4",
    ]);
  });

  it("reports all completed when every countable milestone is done", async () => {
    const user = await createTestUser();
    const goal = await goalWithMilestones(user.id, ["completed", "completed"]);

    const detail = await getGoalDetail(user.id, goal.id);
    expect(detail?.progress).toEqual({ completed: 2, countable: 2 });
    // Completing the last milestone never completes the goal (ADR 0010).
    expect(detail?.goal.status).toBe("active");
  });
});

describe("milestone progress on the goals list", () => {
  it("attaches progress; a goal with no milestones has none", async () => {
    const user = await createTestUser();
    const counted = await goalWithMilestones(user.id, ["completed", "open"]);
    const dropped = await goalWithMilestones(user.id, ["dropped"]);
    const empty = await goalWithMilestones(user.id, []);

    const view = await getGoalsView(user.id, "active");
    const byId = new Map(
      view.groups.flatMap((group) => group.goals).map((g) => [g.id, g]),
    );
    expect(byId.get(counted.id)?.progress).toEqual({
      completed: 1,
      countable: 2,
    });
    expect(byId.get(dropped.id)?.progress).toEqual({
      completed: 0,
      countable: 0,
    });
    expect(byId.get(empty.id)?.progress).toBeNull();
  });
});

describe("listMilestones", () => {
  it("returns nothing for another user's goal", async () => {
    const alice = await createTestUser();
    const bob = await createTestUser();
    const goal = await goalWithMilestones(alice.id, ["open"]);

    expect(await listMilestones(alice.id, goal.id)).toHaveLength(1);
    expect(await listMilestones(bob.id, goal.id)).toEqual([]);
  });
});
