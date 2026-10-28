import { describe, expect, it } from "vitest";

import type { Task } from "./tasks";
import {
  groupTodayTasks,
  plannedSummary,
  relativeDay,
  TODAY_SECTION_HINTS,
  TODAY_SECTION_LABELS,
  todayClock,
  todaySection,
} from "./today";

// Tokyo is UTC+9 with no DST: 23:59 there is 14:59 UTC the same day, and
// 00:01 there is 15:01 UTC the day before.
const TOKYO = "Asia/Tokyo";
const AT_2359 = new Date("2026-10-23T14:59:00Z"); // 23 Oct, 23:59 in Tokyo
const AT_0001 = new Date("2026-10-23T15:01:00Z"); // 24 Oct, 00:01 in Tokyo

let nextId = 0;
function task(fields: Partial<Task> = {}): Task {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    goalId: null,
    milestoneId: null,
    title: `Task ${nextId}`,
    notes: null,
    status: "open",
    priority: null,
    dueDate: null,
    dueAt: null,
    dueTz: null,
    plannedDate: null,
    estimatedMinutes: null,
    reminderOffsetMinutes: null,
    completedAt: null,
    cancelledAt: null,
    sortOrder: nextId,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...fields,
  };
}

const timed = (iso: string) => ({ dueAt: new Date(iso), dueTz: TOKYO });

describe("todayClock", () => {
  it("is the user's date in their zone, not UTC's", () => {
    expect(todayClock(TOKYO, AT_2359)).toEqual({
      today: "2026-10-23",
      now: AT_2359,
      dayStart: new Date("2026-10-22T15:00:00Z"),
      dayEnd: new Date("2026-10-23T15:00:00Z"),
    });
    // UTC is still on the 23rd, Tokyo is on the 24th.
    expect(todayClock(TOKYO, AT_0001).today).toBe("2026-10-24");
    expect(todayClock("UTC", AT_0001).today).toBe("2026-10-23");
  });

  it("follows a DST change: the day is 25 hours long", () => {
    // Europe/Berlin falls back on 25 Oct 2026.
    const clock = todayClock("Europe/Berlin", new Date("2026-10-25T12:00:00Z"));
    expect(clock.dayEnd.getTime() - clock.dayStart.getTime()).toBe(
      25 * 60 * 60 * 1000,
    );
  });
});

describe("relativeDay", () => {
  it("counts from the user's today", () => {
    expect(relativeDay(TOKYO, 0, AT_0001)).toBe("2026-10-24");
    expect(relativeDay(TOKYO, 1, AT_0001)).toBe("2026-10-25");
    expect(relativeDay("America/Los_Angeles", 1, AT_0001)).toBe("2026-10-24");
  });
});

describe("todaySection", () => {
  const late = todayClock(TOKYO, AT_2359); // 23 Oct
  const early = todayClock(TOKYO, AT_0001); // 24 Oct

  it("puts each kind of task in its section at 23:59", () => {
    expect(todaySection(task({ plannedDate: "2026-10-23" }), late)).toBe(
      "planned",
    );
    expect(todaySection(task({ dueDate: "2026-10-23" }), late)).toBe("due");
    // 23:59:30 Tokyo is still later today.
    expect(todaySection(task(timed("2026-10-23T14:59:30Z")), late)).toBe("due");
    // 23:30 Tokyo has passed.
    expect(todaySection(task(timed("2026-10-23T14:30:00Z")), late)).toBe(
      "decide",
    );
    expect(todaySection(task({ dueDate: "2026-10-22" }), late)).toBe("decide");
    expect(todaySection(task({ plannedDate: "2026-10-22" }), late)).toBe(
      "earlier",
    );
    // Tomorrow is not today.
    expect(todaySection(task({ plannedDate: "2026-10-24" }), late)).toBeNull();
    expect(todaySection(task({ dueDate: "2026-10-24" }), late)).toBeNull();
    expect(todaySection(task(timed("2026-10-23T15:00:00Z")), late)).toBeNull();
    expect(todaySection(task(), late)).toBeNull();
  });

  it("moves the same tasks along at 00:01, without changing them", () => {
    const plannedYesterday = task({ plannedDate: "2026-10-23" });
    expect(todaySection(plannedYesterday, early)).toBe("earlier");
    expect(plannedYesterday.plannedDate).toBe("2026-10-23");
    expect(todaySection(task({ dueDate: "2026-10-23" }), early)).toBe("decide");
    expect(todaySection(task(timed("2026-10-23T14:59:30Z")), early)).toBe(
      "decide",
    );
    expect(todaySection(task({ plannedDate: "2026-10-24" }), early)).toBe(
      "planned",
    );
    expect(todaySection(task({ dueDate: "2026-10-24" }), early)).toBe("due");
  });

  it("gives a task that matches several sections only the first that applies", () => {
    // Planned for today beats a passed deadline and a deadline today.
    expect(
      todaySection(
        task({ plannedDate: "2026-10-23", dueDate: "2026-10-20" }),
        late,
      ),
    ).toBe("planned");
    expect(
      todaySection(
        task({ plannedDate: "2026-10-23", dueDate: "2026-10-23" }),
        late,
      ),
    ).toBe("planned");
    // A passed deadline beats an earlier plan.
    expect(
      todaySection(
        task({ plannedDate: "2026-10-21", dueDate: "2026-10-22" }),
        late,
      ),
    ).toBe("decide");
    // A deadline today beats an earlier plan.
    expect(
      todaySection(
        task({ plannedDate: "2026-10-21", dueDate: "2026-10-23" }),
        late,
      ),
    ).toBe("due");
    // A passed deadline still needs a decision when planned for later.
    expect(
      todaySection(
        task({ plannedDate: "2026-10-30", dueDate: "2026-10-22" }),
        late,
      ),
    ).toBe("decide");
  });

  it("leaves completed and cancelled tasks out", () => {
    for (const status of ["completed", "cancelled"] as const) {
      expect(
        todaySection(task({ status, plannedDate: "2026-10-23" }), late),
      ).toBeNull();
    }
  });
});

describe("groupTodayTasks", () => {
  it("sorts each section and drops tasks in none", () => {
    const clock = todayClock(TOKYO, AT_2359);
    const low = task({ plannedDate: "2026-10-23", priority: "low" });
    const high = task({ plannedDate: "2026-10-23", priority: "high" });
    const none = task({ plannedDate: "2026-10-23" });
    const dueTimed = task(timed("2026-10-23T14:59:30Z"));
    const dueAllDay = task({ dueDate: "2026-10-23" });
    const decideNewer = task({ dueDate: "2026-10-22" });
    const decideOlder = task({ dueDate: "2026-10-01" });
    const earlierNewer = task({ plannedDate: "2026-10-22" });
    const earlierOlder = task({ plannedDate: "2026-10-02" });
    const elsewhere = task({ plannedDate: "2026-11-01" });

    const sections = groupTodayTasks(
      [
        low,
        none,
        high,
        dueTimed,
        dueAllDay,
        decideNewer,
        decideOlder,
        earlierNewer,
        earlierOlder,
        elsewhere,
      ],
      clock,
      TOKYO,
    );

    expect(sections.planned).toEqual([high, low, none]);
    expect(sections.due).toEqual([dueAllDay, dueTimed]);
    expect(sections.decide).toEqual([decideOlder, decideNewer]);
    expect(sections.earlier).toEqual([earlierOlder, earlierNewer]);
  });
});

describe("plannedSummary", () => {
  it("counts tasks and adds up the estimates there are", () => {
    expect(plannedSummary([{ estimatedMinutes: null }])).toBe("1 task");
    expect(
      plannedSummary([{ estimatedMinutes: 30 }, { estimatedMinutes: 60 }]),
    ).toBe("2 tasks · 1 h 30 min estimated");
    expect(
      plannedSummary([
        { estimatedMinutes: 45 },
        { estimatedMinutes: null },
        { estimatedMinutes: null },
      ]),
    ).toBe("3 tasks · 45 min estimated, 2 without an estimate");
  });
});

describe("copy", () => {
  it("uses no judgement words", () => {
    const copy = [
      ...Object.values(TODAY_SECTION_LABELS),
      ...Object.values(TODAY_SECTION_HINTS),
    ].join(" ");
    expect(copy).not.toMatch(
      /overdue|late|missed|fail|behind|should have|lazy/i,
    );
  });
});
