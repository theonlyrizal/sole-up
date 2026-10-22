import { describe, expect, it } from "vitest";

import {
  allCountableMilestonesDone,
  milestoneProgressLabel,
} from "./milestones";

describe("milestoneProgressLabel", () => {
  it("shows completed out of countable (dropped ones are not counted)", () => {
    expect(milestoneProgressLabel({ completed: 2, countable: 5 })).toBe(
      "2 of 5 milestones",
    );
  });

  it("uses the singular for one countable milestone", () => {
    expect(milestoneProgressLabel({ completed: 0, countable: 1 })).toBe(
      "0 of 1 milestone",
    );
  });

  it("shows nothing with no milestones or when all are dropped", () => {
    expect(milestoneProgressLabel(null)).toBeNull();
    expect(milestoneProgressLabel({ completed: 0, countable: 0 })).toBeNull();
  });
});

describe("allCountableMilestonesDone", () => {
  it("is true when every countable milestone is completed", () => {
    expect(allCountableMilestonesDone({ completed: 3, countable: 3 })).toBe(
      true,
    );
  });

  it("is false while any countable milestone is open", () => {
    expect(allCountableMilestonesDone({ completed: 2, countable: 3 })).toBe(
      false,
    );
  });

  it("is false with nothing countable, so an empty goal is never offered", () => {
    expect(allCountableMilestonesDone(null)).toBe(false);
    expect(allCountableMilestonesDone({ completed: 0, countable: 0 })).toBe(
      false,
    );
  });
});
