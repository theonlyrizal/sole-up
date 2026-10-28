import { describe, expect, it } from "vitest";

import { formatLocalDate } from "./dates";
import type { Task } from "./tasks";
import {
  dueDayOf,
  groupUpcomingTasks,
  longerUpcomingRange,
  parseUpcomingRange,
  upcomingDayLabel,
  upcomingEmptyTitle,
  upcomingEntryDetails,
  upcomingHref,
  type UpcomingRange,
  UPCOMING_RANGE_LABELS,
  upcomingWindow,
} from "./upcoming";

// Tokyo is UTC+9 with no DST, so a deadline early in a Tokyo day falls on
// the day before in UTC: a UTC-date bug puts it on the wrong day.
const TOKYO = "Asia/Tokyo";
const TODAY = "2026-10-23";

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

const timed = (iso: string, dueTz = TOKYO) => ({ dueAt: new Date(iso), dueTz });

function titlesByDay(tasks: Task[], days: UpcomingRange = 14) {
  const window = upcomingWindow(TODAY, days, TOKYO);
  return Object.fromEntries(
    groupUpcomingTasks(tasks, window, TOKYO).map((day) => [
      day.date,
      day.entries.map(
        (entry) =>
          `${entry.task.title}${entry.planned ? " [planned]" : ""}${entry.due ? " [due]" : ""}`,
      ),
    ]),
  );
}

describe("ranges", () => {
  it("accepts 7, 14 or 30 days and falls back to a week", () => {
    expect(parseUpcomingRange(undefined)).toBe(7);
    expect(parseUpcomingRange("7")).toBe(7);
    expect(parseUpcomingRange("14")).toBe(14);
    expect(parseUpcomingRange("30")).toBe(30);
    expect(parseUpcomingRange(["30", "14"])).toBe(30);
    for (const value of ["8", "31", "abc", "", "30.0x", "-30"]) {
      expect(parseUpcomingRange(value)).toBe(7);
    }
  });

  it("keeps the default week as the plain path, and round-trips", () => {
    expect(upcomingHref(7)).toBe("/plan/upcoming");
    expect(upcomingHref(14)).toBe("/plan/upcoming?days=14");
    expect(upcomingHref(30)).toBe("/plan/upcoming?days=30");
    for (const range of [14, 30] as const) {
      const search = new URL(upcomingHref(range), "http://x").searchParams;
      expect(parseUpcomingRange(search.get("days") ?? undefined)).toBe(range);
    }
  });

  it("labels each tab, and suggests the next longer range when empty", () => {
    expect(UPCOMING_RANGE_LABELS).toEqual({
      7: "Within a Week",
      14: "Next 14 days",
      30: "Next 30 days",
    });
    expect(upcomingEmptyTitle(7)).toBe("Nothing within a week");
    expect(upcomingEmptyTitle(14)).toBe("Nothing in the next 14 days");
    expect(longerUpcomingRange(7)).toBe(14);
    expect(longerUpcomingRange(14)).toBe(30);
    expect(longerUpcomingRange(30)).toBeNull();
  });
});

describe("upcomingWindow", () => {
  it("runs from tomorrow through today + 7, 14 or 30, in the user's zone", () => {
    expect(upcomingWindow(TODAY, 7, TOKYO)).toEqual({
      from: "2026-10-24",
      to: "2026-10-30",
      start: new Date("2026-10-23T15:00:00Z"),
      end: new Date("2026-10-30T15:00:00Z"),
    });
    expect(upcomingWindow(TODAY, 14, TOKYO)).toEqual({
      from: "2026-10-24",
      to: "2026-11-06",
      start: new Date("2026-10-23T15:00:00Z"),
      end: new Date("2026-11-06T15:00:00Z"),
    });
    expect(upcomingWindow(TODAY, 30, TOKYO).to).toBe("2026-11-22");
  });

  it("follows a DST change inside the window", () => {
    // Europe/Berlin falls back from UTC+2 to UTC+1 on 25 Oct 2026.
    const window = upcomingWindow(TODAY, 14, "Europe/Berlin");
    expect(window.start).toEqual(new Date("2026-10-23T22:00:00Z"));
    expect(window.end).toEqual(new Date("2026-11-06T23:00:00Z"));
  });
});

describe("dueDayOf", () => {
  it("is the local day of a timed deadline in the user's zone", () => {
    // 15:30 UTC on the 24th is 00:30 on the 25th in Tokyo.
    const deadline = { dueDate: null, ...timed("2026-10-24T15:30:00Z") };
    expect(dueDayOf(deadline, TOKYO)).toBe("2026-10-25");
    expect(dueDayOf(deadline, "UTC")).toBe("2026-10-24");
    expect(dueDayOf({ dueDate: "2026-10-30", dueAt: null }, TOKYO)).toBe(
      "2026-10-30",
    );
    expect(dueDayOf({ dueDate: null, dueAt: null }, TOKYO)).toBeNull();
  });
});

describe("groupUpcomingTasks", () => {
  it("covers tomorrow through day 14, not today or day 15", () => {
    expect(
      titlesByDay([
        task({ title: "Today", plannedDate: "2026-10-23" }),
        task({ title: "Tomorrow", plannedDate: "2026-10-24" }),
        task({ title: "Day 14", dueDate: "2026-11-06" }),
        task({ title: "Day 15", dueDate: "2026-11-07" }),
        task({ title: "Earlier", dueDate: "2026-10-20" }),
        task({ title: "No dates" }),
      ]),
    ).toEqual({
      "2026-10-24": ["Tomorrow [planned]"],
      "2026-11-06": ["Day 14 [due]"],
    });
  });

  it("within a week covers tomorrow through day 7", () => {
    expect(
      titlesByDay(
        [
          task({ title: "Tomorrow", plannedDate: "2026-10-24" }),
          task({ title: "Day 7", dueDate: "2026-10-30" }),
          task({ title: "Day 8", dueDate: "2026-10-31" }),
          // 00:00 on day 8 in Tokyo is outside the week.
          task({ title: "Day 8 midnight", ...timed("2026-10-30T15:00:00Z") }),
        ],
        7,
      ),
    ).toEqual({
      "2026-10-24": ["Tomorrow [planned]"],
      "2026-10-30": ["Day 7 [due]"],
    });
  });

  it("shows the next 30 days when asked", () => {
    expect(
      titlesByDay(
        [
          task({ title: "Day 15", dueDate: "2026-11-07" }),
          task({ title: "Day 30", plannedDate: "2026-11-22" }),
          task({ title: "Day 31", plannedDate: "2026-11-23" }),
        ],
        30,
      ),
    ).toEqual({
      "2026-11-07": ["Day 15 [due]"],
      "2026-11-22": ["Day 30 [planned]"],
    });
  });

  it("puts a timed deadline on its local day in the user's zone, not UTC's", () => {
    expect(
      titlesByDay([
        // 00:30 on the 25th in Tokyo; still the 24th in UTC.
        task({ title: "Early", ...timed("2026-10-24T15:30:00Z") }),
        // Set in New York: 20:00 on the 30th there is 09:00 on the 31st here.
        task({
          title: "New York",
          ...timed("2026-10-31T00:00:00Z", "America/New_York"),
        }),
        // 00:00 on the first day is in; 00:00 on day 15 is not.
        task({ title: "Window start", ...timed("2026-10-23T15:00:00Z") }),
        task({ title: "Window end", ...timed("2026-11-06T15:00:00Z") }),
      ]),
    ).toEqual({
      "2026-10-24": ["Window start [due]"],
      "2026-10-25": ["Early [due]"],
      "2026-10-31": ["New York [due]"],
    });
  });

  it("merges a plan and a deadline on one day, and shows each on its own day otherwise", () => {
    expect(
      titlesByDay([
        task({
          title: "Same day",
          plannedDate: "2026-10-26",
          dueDate: "2026-10-26",
        }),
        task({
          title: "Same day, timed",
          plannedDate: "2026-10-26",
          ...timed("2026-10-26T08:00:00Z"),
        }),
        task({
          title: "Two days",
          plannedDate: "2026-10-27",
          dueDate: "2026-10-29",
        }),
        // Only the part inside the window shows.
        task({
          title: "Deadline passed",
          plannedDate: "2026-10-28",
          dueDate: "2026-10-20",
        }),
        task({
          title: "Planned today",
          plannedDate: "2026-10-23",
          dueDate: "2026-10-28",
        }),
      ]),
    ).toEqual({
      "2026-10-26": [
        "Same day [planned] [due]",
        "Same day, timed [planned] [due]",
      ],
      "2026-10-27": ["Two days [planned]"],
      "2026-10-28": ["Planned today [due]", "Deadline passed [planned]"],
      "2026-10-29": ["Two days [due]"],
    });
  });

  it("leaves out completed and cancelled tasks", () => {
    expect(
      titlesByDay([
        task({
          title: "Done",
          status: "completed",
          plannedDate: "2026-10-24",
          completedAt: new Date(),
        }),
        task({
          title: "Cancelled",
          status: "cancelled",
          dueDate: "2026-10-24",
          cancelledAt: new Date(),
        }),
      ]),
    ).toEqual({});
  });

  it("orders a day: all-day deadlines, then plans by priority, then timed deadlines by time", () => {
    expect(
      titlesByDay([
        task({ title: "Due 18:00", ...timed("2026-10-26T09:00:00Z") }),
        task({ title: "Planned, no priority", plannedDate: "2026-10-26" }),
        task({ title: "Due 09:00", ...timed("2026-10-26T00:00:00Z") }),
        task({
          title: "Planned, high",
          plannedDate: "2026-10-26",
          priority: "high",
        }),
        task({ title: "Due all day", dueDate: "2026-10-26" }),
      ])["2026-10-26"],
    ).toEqual([
      "Due all day [due]",
      "Planned, high [planned]",
      "Planned, no priority [planned]",
      "Due 09:00 [due]",
      "Due 18:00 [due]",
    ]);
  });

  it("lists days in order and leaves out empty ones", () => {
    const window = upcomingWindow(TODAY, 14, TOKYO);
    const days = groupUpcomingTasks(
      [
        task({ dueDate: "2026-11-01" }),
        task({ plannedDate: "2026-10-25" }),
        task({ plannedDate: "2026-10-30" }),
      ],
      window,
      TOKYO,
    );
    expect(days.map((day) => day.date)).toEqual([
      "2026-10-25",
      "2026-10-30",
      "2026-11-01",
    ]);
  });
});

describe("labels", () => {
  it("calls the first day Tomorrow", () => {
    // The date part's punctuation depends on the ICU version.
    expect(upcomingDayLabel("2026-10-24", TODAY, "en-GB")).toBe(
      `Tomorrow · ${formatLocalDate("2026-10-24", "en-GB", "full")}`,
    );
    expect(upcomingDayLabel("2026-10-25", TODAY, "en-GB")).toMatch(
      /^Sunday,? 25 October 2026$/,
    );
  });

  it("says what an entry is on its day, then its other date and estimate", () => {
    const details = (fields: Partial<Task>, planned: boolean, due: boolean) =>
      upcomingEntryDetails(
        { task: task(fields), planned, due },
        "en-GB",
        TOKYO,
      );

    expect(details({ plannedDate: "2026-10-26" }, true, false)).toEqual([
      "Planned",
    ]);
    expect(details({ dueDate: "2026-10-26" }, false, true)).toEqual(["Due"]);
    // Times in the user's zone: 15:30 UTC is 00:30 in Tokyo.
    expect(details(timed("2026-10-24T15:30:00Z"), false, true)).toEqual([
      "Due 00:30",
    ]);
    expect(
      details(
        { plannedDate: "2026-10-25", ...timed("2026-10-24T15:30:00Z") },
        true,
        true,
      ),
    ).toEqual(["Planned, due 00:30"]);
    expect(
      details(
        {
          plannedDate: "2026-10-27",
          dueDate: "2026-10-29",
          estimatedMinutes: 90,
        },
        true,
        false,
      ),
    ).toEqual(["Planned", "Due 29 Oct 2026", "1 h 30 min"]);
    expect(
      details(
        { plannedDate: "2026-10-27", ...timed("2026-10-29T08:00:00Z") },
        true,
        false,
      ),
    ).toEqual(["Planned", "Due 29 Oct 2026, 17:00"]);
    expect(
      details(
        { plannedDate: "2026-10-27", dueDate: "2026-10-29" },
        false,
        true,
      ),
    ).toEqual(["Due", "Planned 27 Oct 2026"]);
  });

  it("uses calm wording", () => {
    const text = upcomingEntryDetails(
      { task: task({ dueDate: "2026-10-26" }), planned: false, due: true },
      "en-GB",
      TOKYO,
    ).join(" ");
    expect(text).not.toMatch(/late|overdue|missed|behind|fail/i);
  });
});
