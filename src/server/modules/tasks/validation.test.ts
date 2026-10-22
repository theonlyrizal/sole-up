import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  changeTaskStatusSchema,
  createTaskSchema,
  moveTaskSchema,
  moveTasksSchema,
  ONE_PARENT,
  planTaskSchema,
  rescheduleTaskDueSchema,
  TASK_BULK_MAX,
  taskIdsSchema,
  updateTaskSchema,
} from "./validation";

const ID = "4f9c7f3e-2a51-4c55-9a1f-0c6a1e1f3b2d";
const OTHER_ID = "9b1d2c3e-4f50-4a61-8b72-93c4d5e6f708";

function fieldErrors(result: { success: boolean; error?: z.ZodError }) {
  expect(result.success).toBe(false);
  return z.flattenError(result.error!).fieldErrors as Record<string, string[]>;
}

describe("createTaskSchema", () => {
  it("needs only a title and fills the rest with null", () => {
    expect(createTaskSchema.parse({ title: "  Book the dentist  " })).toEqual({
      title: "Book the dentist",
      notes: null,
      priority: null,
      estimatedMinutes: null,
      plannedDate: null,
      goalId: null,
      milestoneId: null,
      dueDate: null,
      dueTime: null,
      dueTz: null,
    });
  });

  it("turns blank form fields into null", () => {
    expect(
      createTaskSchema.parse({
        title: "Call Sam",
        notes: "  ",
        estimatedMinutes: "",
        plannedDate: "",
        dueDate: " ",
        dueTime: "",
        dueTz: "",
      }),
    ).toMatchObject({
      notes: null,
      estimatedMinutes: null,
      plannedDate: null,
      dueDate: null,
      dueTime: null,
      dueTz: null,
    });
  });

  it("requires a title", () => {
    expect(fieldErrors(createTaskSchema.safeParse({ title: "  " }))).toEqual({
      title: ["Give the task a title."],
    });
  });

  it("caps title and notes length", () => {
    const errors = fieldErrors(
      createTaskSchema.safeParse({
        title: "a".repeat(201),
        notes: "b".repeat(2001),
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(["notes", "title"]);
  });

  it("accepts estimates from 1 to 1440 whole minutes, also as form strings", () => {
    expect(
      createTaskSchema.parse({ title: "T", estimatedMinutes: "45" })
        .estimatedMinutes,
    ).toBe(45);
    expect(
      createTaskSchema.parse({ title: "T", estimatedMinutes: 1440 })
        .estimatedMinutes,
    ).toBe(1440);
    for (const bad of [0, 1441, 2.5, "abc", -5]) {
      expect(
        fieldErrors(
          createTaskSchema.safeParse({ title: "T", estimatedMinutes: bad }),
        ),
      ).toHaveProperty("estimatedMinutes");
    }
  });

  it("rejects an unknown priority and an invalid date", () => {
    const errors = fieldErrors(
      createTaskSchema.safeParse({
        title: "T",
        priority: "urgent",
        plannedDate: "2027-02-30",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(["plannedDate", "priority"]);
  });

  it("allows at most one parent", () => {
    expect(
      fieldErrors(
        createTaskSchema.safeParse({
          title: "T",
          goalId: ID,
          milestoneId: OTHER_ID,
        }),
      ),
    ).toEqual({ milestoneId: [ONE_PARENT] });
  });

  it("accepts a timed deadline and canonicalizes the zone", () => {
    expect(
      createTaskSchema.parse({
        title: "T",
        dueDate: "2027-03-12",
        dueTime: "15:00",
        dueTz: "europe/berlin",
      }),
    ).toMatchObject({
      dueDate: "2027-03-12",
      dueTime: "15:00",
      dueTz: "Europe/Berlin",
    });
  });

  it("needs a date and a zone for a time, and a time for a zone", () => {
    expect(
      fieldErrors(createTaskSchema.safeParse({ title: "T", dueTime: "09:30" })),
    ).toEqual({
      dueDate: ["Pick a date for this time."],
      dueTz: ["Choose a time zone."],
    });
    expect(
      fieldErrors(
        createTaskSchema.safeParse({
          title: "T",
          dueDate: "2027-03-12",
          dueTz: "Europe/Berlin",
        }),
      ),
    ).toEqual({ dueTime: ["Enter a time, or clear the time zone."] });
  });

  it("rejects an invalid time and an unknown zone", () => {
    const errors = fieldErrors(
      createTaskSchema.safeParse({
        title: "T",
        dueDate: "2027-03-12",
        dueTime: "24:00",
        dueTz: "Mars/Olympus",
      }),
    );
    expect(errors.dueTime).toEqual(["Enter a valid time."]);
    expect(errors.dueTz).toEqual(["Choose a time zone."]);
  });

  it("rejects unknown keys such as status", () => {
    expect(
      createTaskSchema.safeParse({ title: "T", status: "completed" }).success,
    ).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("edits only the plain fields", () => {
    expect(
      updateTaskSchema.safeParse({
        id: ID,
        title: "T",
        plannedDate: "2027-01-01",
      }).success,
    ).toBe(false);
    expect(updateTaskSchema.parse({ id: ID, title: "T" })).toEqual({
      id: ID,
      title: "T",
      notes: null,
      priority: null,
      estimatedMinutes: null,
    });
  });
});

describe("changeTaskStatusSchema", () => {
  it("accepts the three statuses only", () => {
    for (const status of ["open", "completed", "cancelled"]) {
      expect(changeTaskStatusSchema.safeParse({ id: ID, status }).success).toBe(
        true,
      );
    }
    expect(
      changeTaskStatusSchema.safeParse({ id: ID, status: "in_progress" })
        .success,
    ).toBe(false);
  });
});

describe("planTaskSchema", () => {
  it("accepts a past date and null (unplan)", () => {
    expect(planTaskSchema.parse({ id: ID, plannedDate: "2020-01-01" })).toEqual(
      {
        id: ID,
        plannedDate: "2020-01-01",
      },
    );
    expect(
      planTaskSchema.parse({ id: ID, plannedDate: null }).plannedDate,
    ).toBe(null);
  });
});

describe("rescheduleTaskDueSchema", () => {
  it("clears with all fields blank and checks the shape", () => {
    expect(rescheduleTaskDueSchema.parse({ id: ID })).toEqual({
      id: ID,
      dueDate: null,
      dueTime: null,
      dueTz: null,
    });
    expect(
      fieldErrors(
        rescheduleTaskDueSchema.safeParse({ id: ID, dueTime: "10:00" }),
      ),
    ).toHaveProperty("dueDate");
  });
});

describe("moveTaskSchema", () => {
  it("moves to a goal, a milestone or nowhere, never both", () => {
    expect(moveTaskSchema.parse({ id: ID })).toEqual({
      id: ID,
      goalId: null,
      milestoneId: null,
    });
    expect(
      fieldErrors(
        moveTaskSchema.safeParse({ id: ID, goalId: ID, milestoneId: OTHER_ID }),
      ),
    ).toEqual({ milestoneId: [ONE_PARENT] });
    expect(
      fieldErrors(moveTaskSchema.safeParse({ id: ID, goalId: "nope" })),
    ).toEqual({ goalId: ["Choose one of your goals."] });
  });
});

describe("taskIdsSchema", () => {
  it("drops duplicate IDs", () => {
    expect(taskIdsSchema.parse({ ids: [ID, OTHER_ID, ID] })).toEqual({
      ids: [ID, OTHER_ID],
    });
  });

  it("needs at least one task", () => {
    expect(fieldErrors(taskIdsSchema.safeParse({ ids: [] })).ids).toEqual([
      "Choose at least one task.",
    ]);
  });

  it(`takes at most ${TASK_BULK_MAX} tasks`, () => {
    const ids = Array.from({ length: TASK_BULK_MAX + 1 }, () => ID);
    expect(taskIdsSchema.safeParse({ ids }).success).toBe(false);
  });

  it("rejects an ID that isn't a UUID", () => {
    expect(taskIdsSchema.safeParse({ ids: ["nope"] }).success).toBe(false);
  });
});

describe("moveTasksSchema", () => {
  it("takes a goal for several tasks", () => {
    expect(moveTasksSchema.parse({ ids: [ID], goalId: OTHER_ID })).toEqual({
      ids: [ID],
      goalId: OTHER_ID,
      milestoneId: null,
    });
  });

  it("refuses a goal and a milestone together", () => {
    expect(
      fieldErrors(
        moveTasksSchema.safeParse({
          ids: [ID],
          goalId: OTHER_ID,
          milestoneId: OTHER_ID,
        }),
      ).milestoneId,
    ).toEqual([ONE_PARENT]);
  });
});
