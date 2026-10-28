import { describe, expect, it } from "vitest";

import {
  agendaEnd,
  agendaEntries,
  agendaEntryKind,
  agendaHref,
  agendaRangeLabel,
  type AgendaRange,
  inAgendaRange,
  parseAgendaRange,
  shiftAgendaRange,
} from "./agenda";
import type { CalendarEventOccurrence } from "./calendar-events";
import type { Task } from "./tasks";
import type { TimeBlockOccurrence } from "./time-blocks";

// Tokyo is UTC+9 with no DST, so a time early in a Tokyo day falls on the
// day before in UTC: a UTC-date bug puts it on the wrong day.
const TOKYO = "Asia/Tokyo";
const TODAY = "2026-10-23";
const RANGE: AgendaRange = { start: TODAY, days: 7 };

let nextId = 0;
function id(): string {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
}

function task(fields: Partial<Task> = {}): Task {
  const taskId = id();
  return {
    id: taskId,
    goalId: null,
    milestoneId: null,
    title: `Task ${taskId.slice(-2)}`,
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

const base = {
  description: null,
  location: null,
  rrule: null,
  goalId: null,
  lifeAreaId: null,
  source: "internal" as const,
  reminderOffsetMinutes: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  seriesId: null,
  modified: false,
};

function timedEvent(startIso: string, endIso: string): CalendarEventOccurrence {
  return {
    ...base,
    id: id(),
    title: "Dentist",
    allDay: false,
    startAt: new Date(startIso),
    endAt: new Date(endIso),
    tz: TOKYO,
    startDate: null,
    endDate: null,
    originalStart: null,
  };
}

describe("parseAgendaRange", () => {
  it("defaults to 30 days from today", () => {
    expect(parseAgendaRange({}, TODAY)).toEqual({ start: TODAY, days: 30 });
  });

  it("reads a valid start and day count", () => {
    expect(
      parseAgendaRange({ start: "2026-11-02", days: "14" }, TODAY),
    ).toEqual({ start: "2026-11-02", days: 14 });
    expect(
      parseAgendaRange({ start: ["2026-11-02"], days: ["7"] }, TODAY),
    ).toEqual({ start: "2026-11-02", days: 7 });
  });

  it("falls back on malformed values", () => {
    for (const start of ["2026-02-30", "tomorrow", "2026-1-5", ""]) {
      expect(parseAgendaRange({ start, days: "10" }, TODAY)).toEqual({
        start: TODAY,
        days: 30,
      });
    }
  });
});

describe("agendaHref", () => {
  it("leaves defaults out and round-trips", () => {
    expect(agendaHref({ start: TODAY, days: 30 }, TODAY)).toBe(
      "/plan/calendar",
    );
    expect(agendaHref({ start: TODAY, days: 7 }, TODAY)).toBe(
      "/plan/calendar?days=7",
    );
    const range: AgendaRange = { start: "2026-11-06", days: 14 };
    const href = agendaHref(range, TODAY);
    expect(href).toBe("/plan/calendar?start=2026-11-06&days=14");
    const params = new URL(href, "http://x").searchParams;
    expect(
      parseAgendaRange(
        {
          start: params.get("start") ?? undefined,
          days: params.get("days") ?? undefined,
        },
        TODAY,
      ),
    ).toEqual(range);
  });
});

describe("range helpers", () => {
  it("shifts by the range's own length and labels first and last day", () => {
    expect(agendaEnd(RANGE)).toBe("2026-10-30");
    expect(shiftAgendaRange(RANGE, 1)).toEqual({
      start: "2026-10-30",
      days: 7,
    });
    expect(shiftAgendaRange({ start: TODAY, days: 30 }, -1)).toEqual({
      start: "2026-09-23",
      days: 30,
    });
    expect(agendaRangeLabel(RANGE, "en-GB")).toBe("23 Oct 2026 to 29 Oct 2026");
  });

  it("includes the start and excludes the end", () => {
    expect(inAgendaRange("2026-10-23", RANGE)).toBe(true);
    expect(inAgendaRange("2026-10-29", RANGE)).toBe(true);
    expect(inAgendaRange("2026-10-30", RANGE)).toBe(false);
    expect(inAgendaRange("2026-10-22", RANGE)).toBe(false);
  });
});

describe("agendaEntries", () => {
  it("turns events into timed and all-day rows with stable IDs", () => {
    const timed = timedEvent("2026-10-23T23:30:00Z", "2026-10-24T00:30:00Z");
    const allDay: CalendarEventOccurrence = {
      ...base,
      id: id(),
      title: "Trip",
      allDay: true,
      startAt: null,
      endAt: null,
      tz: null,
      startDate: "2026-10-25",
      endDate: "2026-10-27",
      rrule: "FREQ=WEEKLY",
      seriesId: "s",
      originalStart: "2026-10-25",
    };
    const [first, second] = agendaEntries([timed, allDay], [], RANGE, TOKYO);
    expect(first).toMatchObject({
      id: `event:${timed.id}`,
      allDay: false,
      start: "2026-10-23T23:30:00.000Z",
      end: "2026-10-24T00:30:00.000Z",
      kind: "event",
      order: 0,
    });
    expect(second).toMatchObject({
      id: `event:${allDay.id}:2026-10-25`,
      allDay: true,
      start: "2026-10-25",
      end: "2026-10-27",
    });
    expect(agendaEntryKind(first!)).toBe("Event");
  });

  it("lists time blocks as timed rows under their task's title", () => {
    const event = timedEvent("2026-10-24T01:00:00Z", "2026-10-24T02:00:00Z");
    const planned = task({ plannedDate: "2026-10-24" });
    const block: TimeBlockOccurrence = {
      id: id(),
      taskId: planned.id,
      startAt: new Date("2026-10-24T01:00:00Z"),
      endAt: new Date("2026-10-24T02:30:00Z"),
      tz: TOKYO,
      rrule: null,
      status: "done",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      seriesId: null,
      originalStart: null,
      modified: false,
      taskTitle: planned.title,
      taskStatus: "open",
      goalId: null,
      lifeAreaId: null,
    };
    const entries = agendaEntries([event], [planned], RANGE, TOKYO, [block]);
    expect(entries.map((entry) => entry.kind)).toEqual([
      "event",
      "block",
      "task",
    ]);
    // At the same start, events come first, then blocks, then tasks.
    expect(entries.map((entry) => entry.order)).toEqual([0, 0.5, 1]);
    expect(entries[1]).toMatchObject({
      id: `block:${block.id}:`,
      title: planned.title,
      allDay: false,
      start: "2026-10-24T01:00:00.000Z",
      end: "2026-10-24T02:30:00.000Z",
    });
    expect(agendaEntryKind(entries[1]!)).toBe("Time block");
  });

  it("gives a plan an all-day row and a timed deadline a row at its time", () => {
    const planned = task({ plannedDate: "2026-10-24" });
    // 00:30 on the 25th in Tokyo is still the 24th in UTC.
    const due = task({
      dueAt: new Date("2026-10-24T15:30:00Z"),
      dueTz: TOKYO,
    });
    const entries = agendaEntries([], [planned, due], RANGE, TOKYO);
    expect(entries.map((entry) => [entry.id, entry.start, entry.end])).toEqual([
      [`task:${planned.id}:planned`, "2026-10-24", "2026-10-25"],
      [`task:${due.id}:due`, "2026-10-24T15:30:00.000Z", null],
    ]);
    expect(entries.map((entry) => agendaEntryKind(entry))).toEqual([
      "Planned task",
      "Task due",
    ]);
  });

  it("merges a plan and a deadline on the same local day into one row", () => {
    const both = task({
      plannedDate: "2026-10-25",
      dueAt: new Date("2026-10-24T15:30:00Z"), // 25 Oct 00:30 in Tokyo
      dueTz: "America/New_York",
    });
    const entries = agendaEntries([], [both], RANGE, TOKYO);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ allDay: false, role: "plannedDue" });
    expect(agendaEntryKind(entries[0]!)).toBe("Planned task, due");
  });

  it("shows only the parts inside the range, on the user's local days", () => {
    const planOutside = task({
      plannedDate: "2026-10-30",
      // 29 Oct 23:59 in Tokyo: the range's last day.
      dueAt: new Date("2026-10-29T14:59:00Z"),
      dueTz: TOKYO,
    });
    // 30 Oct 00:00 in Tokyo: the day after the range.
    const dueAfter = task({
      dueAt: new Date("2026-10-29T15:00:00Z"),
      dueTz: TOKYO,
    });
    // 22 Oct 23:59 in Tokyo: the day before.
    const dueBefore = task({
      dueAt: new Date("2026-10-22T14:59:00Z"),
      dueTz: TOKYO,
    });
    const allDayDeadline = task({ dueDate: "2026-10-24" });
    const entries = agendaEntries(
      [],
      [planOutside, dueAfter, dueBefore, allDayDeadline],
      RANGE,
      TOKYO,
    );
    expect(entries.map((entry) => entry.id)).toEqual([
      `task:${planOutside.id}:due`,
    ]);
    expect(entries[0]).toMatchObject({ role: "due" });
  });
});
