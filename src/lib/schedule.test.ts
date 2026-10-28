import { describe, expect, it } from "vitest";

import type { CalendarEventOccurrence } from "./calendar-events";
import { instantFromLocal } from "./dates";
import {
  commitmentWhenLabel,
  nextCommitmentOf,
  type ScheduleEntry,
  timelineEntries,
  timelineTimeLabel,
} from "./schedule";
import type { TimeBlockOccurrence } from "./time-blocks";

// Tokyo is UTC+9 with no DST. At NOW it is 00:01 on Sat 24 Oct in Tokyo but
// still the 23rd in UTC, so a UTC-date bug shows.
const TOKYO = "Asia/Tokyo";
const TODAY = "2026-10-24";
const NOW = new Date("2026-10-23T15:01:00Z");
const LOCALE = "en-GB";

const at = (local: string) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, TOKYO);
};

let nextId = 0;
function id(): string {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
}

const stamps = {
  rrule: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  seriesId: null,
  originalStart: null,
  modified: false,
};

const eventBase = {
  description: null,
  location: null,
  goalId: null,
  lifeAreaId: null,
  source: "internal" as const,
  reminderOffsetMinutes: null,
  ...stamps,
};

function event(title: string, start: string, end: string) {
  return {
    ...eventBase,
    id: id(),
    title,
    allDay: false,
    startAt: at(start),
    endAt: at(end),
    tz: TOKYO,
    startDate: null,
    endDate: null,
  } satisfies CalendarEventOccurrence;
}

/** An all-day event; `endDate` is exclusive, as stored. */
function allDay(title: string, startDate: string, endDate: string) {
  return {
    ...eventBase,
    id: id(),
    title,
    allDay: true,
    startAt: null,
    endAt: null,
    tz: null,
    startDate,
    endDate,
  } satisfies CalendarEventOccurrence;
}

function block(
  title: string,
  start: string,
  end: string,
  fields: Partial<TimeBlockOccurrence> = {},
): TimeBlockOccurrence {
  return {
    ...stamps,
    id: id(),
    taskId: id(),
    startAt: at(start),
    endAt: at(end),
    tz: TOKYO,
    status: "scheduled",
    taskTitle: title,
    taskStatus: "open",
    goalId: null,
    lifeAreaId: null,
    ...fields,
  };
}

const titles = (entries: ScheduleEntry[]) => entries.map((e) => e.title);

describe("timelineEntries", () => {
  it("puts all-day events first, then everything by start", () => {
    const entries = timelineEntries(
      [
        event("Dentist", "2026-10-24 09:00", "2026-10-24 10:00"),
        allDay("Birthday", "2026-10-24", "2026-10-25"),
        event("Late call", "2026-10-23 23:30", "2026-10-24 00:30"),
        allDay("Trip", "2026-10-22", "2026-10-26"),
      ],
      [
        block("Write report", "2026-10-24 08:00", "2026-10-24 09:00"),
        // Same start as the dentist: events before blocks.
        block("Read", "2026-10-24 09:00", "2026-10-24 09:30", {
          status: "done",
        }),
      ],
      TOKYO,
    );
    expect(titles(entries)).toEqual([
      "Trip",
      "Birthday",
      "Late call",
      "Write report",
      "Dentist",
      "Read",
    ]);
    // Marked blocks stay on the timeline.
    expect(entries.at(-1)).toMatchObject({ kind: "block" });
  });
});

describe("nextCommitmentOf", () => {
  it("is null with nothing, or with only ended items", () => {
    expect(nextCommitmentOf([], [], NOW, TOKYO)).toBeNull();
    expect(
      nextCommitmentOf(
        [
          // Ends exactly now's midnight: ended.
          event("Ended", "2026-10-23 23:00", "2026-10-24 00:00"),
          allDay("Yesterday", "2026-10-23", "2026-10-24"),
        ],
        [block("Ended block", "2026-10-23 22:00", "2026-10-24 00:01")],
        NOW,
        TOKYO,
      ),
    ).toBeNull();
  });

  it("picks the earliest start among items that haven't ended", () => {
    const next = nextCommitmentOf(
      [event("Dentist", "2026-10-24 09:00", "2026-10-24 10:00")],
      [block("Write report", "2026-10-24 08:00", "2026-10-24 09:00")],
      NOW,
      TOKYO,
    );
    expect(next).toMatchObject({ kind: "block", title: "Write report" });

    // One under way counts, and began earliest.
    expect(
      nextCommitmentOf(
        [
          event("Dentist", "2026-10-24 09:00", "2026-10-24 10:00"),
          event("Late call", "2026-10-23 23:30", "2026-10-24 00:30"),
        ],
        [],
        NOW,
        TOKYO,
      )?.title,
    ).toBe("Late call");

    // An all-day event starts at its day's local midnight.
    expect(
      nextCommitmentOf(
        [
          event("Dentist", "2026-10-24 09:00", "2026-10-24 10:00"),
          allDay("Birthday", "2026-10-24", "2026-10-25"),
        ],
        [],
        NOW,
        TOKYO,
      )?.title,
    ).toBe("Birthday");
  });

  it("skips marked blocks and blocks for closed tasks", () => {
    const next = nextCommitmentOf(
      [],
      [
        block("Done", "2026-10-24 07:00", "2026-10-24 08:00", {
          status: "done",
        }),
        block("Skipped", "2026-10-24 08:00", "2026-10-24 09:00", {
          status: "skipped",
        }),
        block("Completed task", "2026-10-24 09:00", "2026-10-24 10:00", {
          taskStatus: "completed",
        }),
        block("Cancelled task", "2026-10-24 10:00", "2026-10-24 11:00", {
          taskStatus: "cancelled",
        }),
        block("Still on", "2026-10-24 12:00", "2026-10-24 13:00"),
      ],
      NOW,
      TOKYO,
    );
    expect(next?.title).toBe("Still on");
  });
});

describe("labels", () => {
  const entry = (events: CalendarEventOccurrence[]) =>
    timelineEntries(events, [], TOKYO)[0]!;

  it("words a timeline row's time", () => {
    expect(
      timelineTimeLabel(
        entry([allDay("Trip", "2026-10-22", "2026-10-26")]),
        TODAY,
        LOCALE,
        TOKYO,
      ),
    ).toBe("All day");
    expect(
      timelineTimeLabel(
        entry([event("Dentist", "2026-10-24 09:00", "2026-10-24 10:30")]),
        TODAY,
        LOCALE,
        TOKYO,
      ),
    ).toBe("09:00 – 10:30");
    // Began yesterday: both ends carry their dates.
    expect(
      timelineTimeLabel(
        entry([event("Late call", "2026-10-23 23:30", "2026-10-24 00:30")]),
        TODAY,
        LOCALE,
        TOKYO,
      ),
    ).toBe("Fri 23 Oct, 23:30 – Sat 24 Oct, 00:30");
  });

  it("words when the next commitment is", () => {
    const when = (events: CalendarEventOccurrence[]) =>
      commitmentWhenLabel(entry(events), NOW, TODAY, LOCALE, TOKYO);
    expect(when([event("A", "2026-10-24 09:00", "2026-10-24 10:00")])).toBe(
      "Today · 09:00 – 10:00",
    );
    expect(when([event("A", "2026-10-25 09:00", "2026-10-25 10:00")])).toBe(
      "Tomorrow · 09:00 – 10:00",
    );
    expect(when([event("A", "2026-10-27 09:00", "2026-10-27 10:00")])).toBe(
      "Tuesday, 27 October 2026 · 09:00 – 10:00",
    );
    expect(when([event("A", "2026-10-23 23:30", "2026-10-24 00:30")])).toBe(
      "Now, until 00:30",
    );
    expect(when([allDay("Trip", "2026-10-22", "2026-10-26")])).toBe(
      "Today · All day",
    );
    expect(when([allDay("Trip", "2026-10-25", "2026-10-26")])).toBe(
      "Tomorrow · All day",
    );
  });
});
