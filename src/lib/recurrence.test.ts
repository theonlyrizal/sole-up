import { describe, expect, it } from "vitest";

import { instantFromLocal, localDateTimeOf } from "./dates";
import {
  countOccurrencesBefore,
  describeRecurrence,
  endRuleBefore,
  expandOccurrences,
  fromRrule,
  occurrenceStartOn,
  recurrenceSchema,
  ruleWithCount,
  rruleSchema,
  seriesStartDate,
  toRrule,
  type AllDaySeries,
  type Recurrence,
  type TimedSeries,
} from "./recurrence";

const NEW_YORK = "America/New_York";

/** A timed series starting at a New York wall-clock time. */
function timed(
  rrule: string,
  date: string,
  time: string,
  minutes = 60,
): TimedSeries {
  const startAt = instantFromLocal(date, time, NEW_YORK);
  return {
    allDay: false,
    rrule,
    startAt,
    endAt: new Date(startAt.getTime() + minutes * 60_000),
    tz: NEW_YORK,
  };
}

function allDay(
  rrule: string,
  startDate: string,
  endDate: string,
): AllDaySeries {
  return { allDay: true, rrule, startDate, endDate };
}

const range = (localStart: string, localEnd: string, tz = NEW_YORK) => ({
  localStart,
  localEnd,
  tz,
});

/** Occurrence starts as New York "YYYY-MM-DD HH:MM". */
const localStarts = (occurrences: { startAt: Date }[]) =>
  occurrences.map((occurrence) => {
    const { date, time } = localDateTimeOf(occurrence.startAt, NEW_YORK);
    return `${date} ${time}`;
  });

const startDates = (occurrences: { startDate: string }[]) =>
  occurrences.map((occurrence) => occurrence.startDate);

describe("rule ↔ builder conversion", () => {
  it.each([
    "FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=3;COUNT=10",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261220",
    "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
    "FREQ=MONTHLY;BYMONTHDAY=31",
    "FREQ=MONTHLY;BYDAY=-1FR;COUNT=12",
    "FREQ=MONTHLY;INTERVAL=3;BYDAY=2TU",
    "FREQ=YEARLY;UNTIL=20400229",
  ])("round-trips %s", (rule) => {
    expect(toRrule(fromRrule(rule))).toBe(rule);
  });

  it.each<Recurrence>([
    { frequency: "daily", interval: 1, end: { type: "never" } },
    {
      frequency: "weekly",
      interval: 2,
      weekdays: ["MO", "TH"],
      end: { type: "until", until: "2026-12-20" },
    },
    {
      frequency: "monthly",
      interval: 1,
      monthlyOn: { type: "dayOfMonth", day: 31 },
      end: { type: "count", count: 5 },
    },
    {
      frequency: "monthly",
      interval: 1,
      monthlyOn: { type: "weekdayOfMonth", ordinal: -1, weekday: "FR" },
      end: { type: "never" },
    },
    { frequency: "yearly", interval: 4, end: { type: "never" } },
  ])("round-trips builder values for $frequency", (values) => {
    expect(fromRrule(toRrule(values))).toEqual(values);
  });

  it("maps a rule to builder values", () => {
    expect(
      fromRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261220"),
    ).toEqual({
      frequency: "weekly",
      interval: 2,
      weekdays: ["MO", "TH"],
      end: { type: "until", until: "2026-12-20" },
    });
    expect(fromRrule("FREQ=MONTHLY;BYDAY=-1FR;COUNT=12")).toEqual({
      frequency: "monthly",
      interval: 1,
      monthlyOn: { type: "weekdayOfMonth", ordinal: -1, weekday: "FR" },
      end: { type: "count", count: 12 },
    });
  });

  it("accepts parts in any order and writes the canonical form", () => {
    expect(toRrule(fromRrule("BYDAY=TH,MO;INTERVAL=1;FREQ=WEEKLY"))).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TH",
    );
    expect(
      toRrule({
        frequency: "weekly",
        interval: 1,
        weekdays: ["FR", "MO"],
        end: { type: "never" },
      }),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
  });

  it.each([
    ["", "malformed"],
    ["RRULE:FREQ=DAILY", "malformed"],
    ["freq=daily", "malformed"],
    ["FREQ=DAILY;", "malformed"],
    ["FREQ=HOURLY", "daily, weekly, monthly or yearly"],
    ["INTERVAL=2", "daily, weekly, monthly or yearly"],
    ["FREQ=DAILY;FREQ=DAILY", "repeats FREQ"],
    ["FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1", "can't use BYSETPOS"],
    ["FREQ=WEEKLY;BYDAY=MO;WKST=SU", "can't use WKST"],
    ["FREQ=YEARLY;BYMONTH=2", "can't use BYMONTH"],
    ["FREQ=DAILY;DTSTART=20260101", "can't use DTSTART"],
    ["FREQ=DAILY;INTERVAL=0", "whole number"],
    ["FREQ=DAILY;INTERVAL=100", "at most every 99"],
    ["FREQ=DAILY;COUNT=0", "whole number"],
    ["FREQ=DAILY;COUNT=1000", "at most 999"],
    ["FREQ=DAILY;COUNT=5;UNTIL=20261220", "not both"],
    ["FREQ=DAILY;UNTIL=20261220T000000Z", "must be a date"],
    ["FREQ=DAILY;UNTIL=20260230", "valid date"],
    ["FREQ=DAILY;BYDAY=MO", "can't choose days"],
    ["FREQ=YEARLY;BYMONTHDAY=29", "can't choose days"],
    ["FREQ=WEEKLY", "needs its days"],
    ["FREQ=WEEKLY;BYDAY=1MO", "plain weekdays"],
    ["FREQ=WEEKLY;BYDAY=MO,MO", "each day once"],
    ["FREQ=WEEKLY;BYDAY=MO;BYMONTHDAY=1", "day of the month"],
    ["FREQ=MONTHLY", "either a day of the month or a weekday"],
    ["FREQ=MONTHLY;BYMONTHDAY=1;BYDAY=1MO", "either"],
    ["FREQ=MONTHLY;BYMONTHDAY=-1", "day of the month"],
    ["FREQ=MONTHLY;BYMONTHDAY=32", "day of the month"],
    ["FREQ=MONTHLY;BYMONTHDAY=1,15", "day of the month"],
    ["FREQ=MONTHLY;BYDAY=MO", "first to fourth, or last"],
    ["FREQ=MONTHLY;BYDAY=5MO", "first to fourth, or last"],
    ["FREQ=MONTHLY;BYDAY=-2FR", "first to fourth, or last"],
    ["FREQ=MONTHLY;BYDAY=+1MO", "malformed"],
    ["FREQ=MONTHLY;BYDAY=1MO,3MO", "first to fourth, or last"],
  ])("rejects %j", (rule, message) => {
    const result = rruleSchema.safeParse(rule);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
    expect(() => fromRrule(rule)).toThrow(RangeError);
  });

  it("rejects builder values outside the subset", () => {
    const invalid: unknown[] = [
      {
        frequency: "weekly",
        interval: 1,
        weekdays: [],
        end: { type: "never" },
      },
      { frequency: "daily", interval: 1.5, end: { type: "never" } },
      {
        frequency: "daily",
        interval: 1,
        end: { type: "until", until: "2026-02-30" },
      },
      { frequency: "daily", interval: 1, end: { type: "never" }, byHour: [9] },
      {
        frequency: "yearly",
        interval: 1,
        weekdays: ["MO"],
        end: { type: "never" },
      },
      {
        frequency: "monthly",
        interval: 1,
        monthlyOn: { type: "weekdayOfMonth", ordinal: 5, weekday: "MO" },
        end: { type: "never" },
      },
      { frequency: "hourly", interval: 1, end: { type: "never" } },
    ];
    for (const values of invalid)
      expect(recurrenceSchema.safeParse(values).success).toBe(false);
  });
});

describe("expandOccurrences: timed", () => {
  it("keeps a weekly 09:00 at 09:00 across New York's spring-forward", () => {
    const occurrences = expandOccurrences(
      timed("FREQ=WEEKLY;BYDAY=MO", "2026-03-02", "09:00"),
      range("2026-03-01", "2026-03-17"),
    );
    expect(localStarts(occurrences)).toEqual([
      "2026-03-02 09:00",
      "2026-03-09 09:00",
      "2026-03-16 09:00",
    ]);
    expect(occurrences.map((o) => o.startAt.toISOString())).toEqual([
      "2026-03-02T14:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
      "2026-03-16T13:00:00.000Z",
    ]);
    for (const occurrence of occurrences)
      expect(occurrence.endAt.getTime() - occurrence.startAt.getTime()).toBe(
        3_600_000,
      );
  });

  it("keeps a weekly 09:00 at 09:00 across New York's fall-back", () => {
    const occurrences = expandOccurrences(
      timed("FREQ=WEEKLY;BYDAY=MO", "2026-03-02", "09:00"),
      range("2026-10-25", "2026-11-10"),
    );
    expect(localStarts(occurrences)).toEqual([
      "2026-10-26 09:00",
      "2026-11-02 09:00",
      "2026-11-09 09:00",
    ]);
    expect(occurrences.map((o) => o.startAt.toISOString())).toEqual([
      "2026-10-26T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-09T14:00:00.000Z",
    ]);
  });

  it("moves a time skipped by spring-forward forward instead of dropping it", () => {
    const occurrences = expandOccurrences(
      timed("FREQ=DAILY", "2026-03-07", "02:30"),
      range("2026-03-07", "2026-03-10"),
    );
    expect(localStarts(occurrences)).toEqual([
      "2026-03-07 02:30",
      "2026-03-08 03:30",
      "2026-03-09 02:30",
    ]);
  });

  it("keeps the elapsed duration of an occurrence that crosses DST", () => {
    const [occurrence] = expandOccurrences(
      timed("FREQ=WEEKLY;BYDAY=SA", "2026-03-07", "23:00", 6 * 60),
      range("2026-03-07", "2026-03-08"),
    );
    expect(occurrence.endAt.getTime() - occurrence.startAt.getTime()).toBe(
      6 * 3_600_000,
    );
    expect(localDateTimeOf(occurrence.endAt, NEW_YORK)).toEqual({
      date: "2026-03-08",
      time: "06:00",
    });
  });

  it("repeats monthly on the last Friday", () => {
    const occurrences = expandOccurrences(
      timed("FREQ=MONTHLY;BYDAY=-1FR", "2026-01-30", "17:00"),
      range("2026-01-01", "2027-01-01"),
    );
    expect(localStarts(occurrences)).toEqual([
      "2026-01-30 17:00",
      "2026-02-27 17:00",
      "2026-03-27 17:00",
      "2026-04-24 17:00",
      "2026-05-29 17:00",
      "2026-06-26 17:00",
      "2026-07-31 17:00",
      "2026-08-28 17:00",
      "2026-09-25 17:00",
      "2026-10-30 17:00",
      "2026-11-27 17:00",
      "2026-12-25 17:00",
    ]);
  });

  it("stops after COUNT occurrences, counting the start", () => {
    const series = timed(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=3",
      "2026-01-05",
      "09:00",
    );
    expect(
      localStarts(expandOccurrences(series, range("2026-01-01", "2026-03-01"))),
    ).toEqual(["2026-01-05 09:00", "2026-01-08 09:00", "2026-01-19 09:00"]);
    // A range after the last occurrence is empty.
    expect(
      expandOccurrences(series, range("2026-01-20", "2026-12-31")),
    ).toEqual([]);
  });

  it("counts a start that doesn't match the rule's days as the first occurrence", () => {
    // 2026-01-07 is a Wednesday.
    const series = timed("FREQ=WEEKLY;BYDAY=MO;COUNT=3", "2026-01-07", "09:00");
    expect(
      localStarts(expandOccurrences(series, range("2026-01-01", "2026-03-01"))),
    ).toEqual(["2026-01-07 09:00", "2026-01-12 09:00", "2026-01-19 09:00"]);
  });

  it("includes UNTIL's local date and nothing after it", () => {
    const series = timed("FREQ=DAILY;UNTIL=20260107", "2026-01-05", "23:30");
    const occurrences = expandOccurrences(
      series,
      range("2026-01-01", "2026-02-01"),
    );
    // The last one starts on 7 Jan in New York, which is already 8 Jan in UTC.
    expect(localStarts(occurrences)).toEqual([
      "2026-01-05 23:30",
      "2026-01-06 23:30",
      "2026-01-07 23:30",
    ]);
    expect(occurrences.at(-1)?.startAt.toISOString()).toBe(
      "2026-01-08T04:30:00.000Z",
    );
  });

  it("generates nothing when UNTIL is before the start", () => {
    expect(
      expandOccurrences(
        timed("FREQ=DAILY;UNTIL=20260104", "2026-01-05", "09:00"),
        range("2026-01-01", "2026-02-01"),
      ),
    ).toEqual([]);
  });

  it("excludes an occurrence that ends exactly at the range start", () => {
    // 23:00–00:00: the 5 Jan occurrence ends at the first instant of 6 Jan.
    const occurrences = expandOccurrences(
      timed("FREQ=DAILY", "2026-01-05", "23:00"),
      range("2026-01-06", "2026-01-07"),
    );
    expect(localStarts(occurrences)).toEqual(["2026-01-06 23:00"]);
  });

  it("includes an occurrence starting at the range start, not one at its end", () => {
    const occurrences = expandOccurrences(
      timed("FREQ=DAILY", "2026-01-05", "00:00"),
      range("2026-01-06", "2026-01-08"),
    );
    expect(localStarts(occurrences)).toEqual([
      "2026-01-06 00:00",
      "2026-01-07 00:00",
    ]);
  });

  it("includes an occurrence that started before the range and is still running", () => {
    const occurrences = expandOccurrences(
      timed("FREQ=WEEKLY;BYDAY=FR", "2026-01-02", "18:00", 3 * 24 * 60),
      range("2026-01-12", "2026-01-13"),
    );
    expect(localStarts(occurrences)).toEqual(["2026-01-09 18:00"]);
  });

  it("finds occurrences for a range in another zone", () => {
    // 21:00 in New York is 11:00 the next day in Tokyo, so Tokyo's 6 Jan
    // holds New York's 5 Jan occurrence.
    const occurrences = expandOccurrences(
      timed("FREQ=DAILY", "2026-01-01", "21:00"),
      range("2026-01-06", "2026-01-07", "Asia/Tokyo"),
    );
    expect(occurrences.map((o) => o.startAt.toISOString())).toEqual([
      "2026-01-06T02:00:00.000Z",
    ]);
    expect(localStarts(occurrences)).toEqual(["2026-01-05 21:00"]);
  });

  it("keeps the stored start for a first occurrence in the later fall-back hour", () => {
    // 01:30 happens twice on 1 Nov 2026; the series starts at the second (EST).
    const startAt = new Date("2026-11-01T06:30:00Z");
    const [first, second] = expandOccurrences(
      {
        allDay: false,
        rrule: "FREQ=DAILY",
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
        tz: NEW_YORK,
      },
      range("2026-11-01", "2026-11-03"),
    );
    expect(first.startAt).toEqual(startAt);
    expect(localStarts([second])).toEqual(["2026-11-02 01:30"]);
  });

  describe("exceptions", () => {
    const series = timed("FREQ=DAILY", "2026-01-05", "09:00");
    const at = (date: string, time = "09:00") =>
      instantFromLocal(date, time, NEW_YORK);

    it("removes cancelled occurrences and moves and patches modified ones", () => {
      const occurrences = expandOccurrences(
        series,
        range("2026-01-05", "2026-01-09"),
        [
          { kind: "cancelled", originalStartAt: at("2026-01-06") },
          {
            kind: "modified",
            originalStartAt: at("2026-01-07"),
            startAt: at("2026-01-07", "15:00"),
            patch: { title: "Moved" },
          },
        ],
      );
      expect(localStarts(occurrences)).toEqual([
        "2026-01-05 09:00",
        "2026-01-07 15:00",
        "2026-01-08 09:00",
      ]);
      expect(occurrences[1]).toEqual({
        originalStartAt: at("2026-01-07"),
        startAt: at("2026-01-07", "15:00"),
        endAt: at("2026-01-07", "16:00"),
        modified: true,
        patch: { title: "Moved" },
      });
      expect(occurrences[0]).toMatchObject({ modified: false, patch: null });
    });

    it("applies a modified exception's own end", () => {
      const [occurrence] = expandOccurrences(
        series,
        range("2026-01-05", "2026-01-06"),
        [
          {
            kind: "modified",
            originalStartAt: at("2026-01-05"),
            endAt: at("2026-01-05", "12:00"),
          },
        ],
      );
      expect(occurrence).toMatchObject({
        startAt: at("2026-01-05"),
        endAt: at("2026-01-05", "12:00"),
        modified: true,
        patch: null,
      });
    });

    it("includes an occurrence moved into the range and drops one moved out", () => {
      const occurrences = expandOccurrences(
        series,
        range("2026-01-05", "2026-01-09"),
        [
          {
            kind: "modified",
            originalStartAt: at("2026-03-12"),
            startAt: at("2026-01-08", "18:00"),
          },
          {
            kind: "modified",
            originalStartAt: at("2026-01-06"),
            startAt: at("2026-01-20"),
          },
        ],
      );
      expect(localStarts(occurrences)).toEqual([
        "2026-01-05 09:00",
        "2026-01-07 09:00",
        "2026-01-08 09:00",
        "2026-01-08 18:00",
      ]);
      expect(occurrences[3].originalStartAt).toEqual(at("2026-03-12"));
    });

    it("ignores exceptions for starts the rule doesn't generate", () => {
      const occurrences = expandOccurrences(
        series,
        range("2026-01-05", "2026-01-07"),
        [
          { kind: "cancelled", originalStartAt: at("2026-01-05", "10:00") },
          {
            kind: "modified",
            originalStartAt: at("2026-01-04"),
            startAt: at("2026-01-06", "12:00"),
          },
        ],
      );
      expect(localStarts(occurrences)).toEqual([
        "2026-01-05 09:00",
        "2026-01-06 09:00",
      ]);
    });
  });
});

describe("expandOccurrences: all-day", () => {
  it("repeats monthly on the 31st, skipping shorter months", () => {
    const occurrences = expandOccurrences(
      allDay("FREQ=MONTHLY;BYMONTHDAY=31", "2026-01-31", "2026-02-01"),
      range("2026-01-01", "2027-01-01"),
    );
    expect(startDates(occurrences)).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
      "2026-08-31",
      "2026-10-31",
      "2026-12-31",
    ]);
    expect(occurrences[0].endDate).toBe("2026-02-01");
  });

  it("repeats yearly on 29 Feb in leap years only, and COUNT counts only those", () => {
    const series = allDay("FREQ=YEARLY;COUNT=2", "2028-02-29", "2028-03-01");
    expect(
      startDates(expandOccurrences(series, range("2028-01-01", "2028-12-31"))),
    ).toEqual(["2028-02-29"]);
    expect(
      expandOccurrences(series, range("2029-01-01", "2029-12-31")),
    ).toEqual([]);
    expect(
      startDates(expandOccurrences(series, range("2032-01-01", "2032-12-31"))),
    ).toEqual(["2032-02-29"]);
    expect(
      expandOccurrences(series, range("2036-01-01", "2036-12-31")),
    ).toEqual([]);
  });

  it("treats the end date as exclusive at both range edges", () => {
    // Two-day occurrences every Monday: 5–6 Jan, 12–13 Jan (ends 7th, 14th).
    const series = allDay("FREQ=WEEKLY;BYDAY=MO", "2026-01-05", "2026-01-07");
    expect(
      expandOccurrences(series, range("2026-01-07", "2026-01-12")),
    ).toEqual([]);
    expect(
      startDates(expandOccurrences(series, range("2026-01-06", "2026-01-13"))),
    ).toEqual(["2026-01-05", "2026-01-12"]);
  });

  it("stops at COUNT and includes UNTIL's date", () => {
    expect(
      startDates(
        expandOccurrences(
          allDay("FREQ=DAILY;INTERVAL=2;COUNT=3", "2026-01-01", "2026-01-02"),
          range("2026-01-01", "2026-02-01"),
        ),
      ),
    ).toEqual(["2026-01-01", "2026-01-03", "2026-01-05"]);
    expect(
      startDates(
        expandOccurrences(
          allDay("FREQ=DAILY;UNTIL=20260103", "2026-01-01", "2026-01-02"),
          range("2026-01-01", "2026-02-01"),
        ),
      ),
    ).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("cancels and moves occurrences by their original date", () => {
    const series = allDay("FREQ=WEEKLY;BYDAY=MO", "2026-01-05", "2026-01-06");
    const occurrences = expandOccurrences(
      series,
      range("2026-01-01", "2026-02-01"),
      [
        { kind: "cancelled", originalStartDate: "2026-01-12" },
        {
          kind: "modified",
          originalStartDate: "2026-01-19",
          startDate: "2026-01-21",
          patch: { location: "Office" },
        },
        // Moved in from February.
        {
          kind: "modified",
          originalStartDate: "2026-02-02",
          startDate: "2026-01-30",
        },
        // Not generated by the rule (a Tuesday).
        { kind: "cancelled", originalStartDate: "2026-01-27" },
      ],
    );
    expect(
      occurrences.map((o) => [o.originalStartDate, o.startDate, o.endDate]),
    ).toEqual([
      ["2026-01-05", "2026-01-05", "2026-01-06"],
      ["2026-01-19", "2026-01-21", "2026-01-22"],
      ["2026-01-26", "2026-01-26", "2026-01-27"],
      ["2026-02-02", "2026-01-30", "2026-01-31"],
    ]);
    expect(occurrences[1]).toMatchObject({
      modified: true,
      patch: { location: "Office" },
    });
  });
});

describe("expandOccurrences: range", () => {
  const series = allDay("FREQ=DAILY", "2026-01-01", "2026-01-02");

  it("accepts a range of up to 366 days", () => {
    expect(
      expandOccurrences(series, range("2026-01-01", "2027-01-02")),
    ).toHaveLength(366);
    expect(
      expandOccurrences(
        timed("FREQ=DAILY", "2026-01-01", "09:00"),
        range("2026-01-01", "2027-01-02"),
      ),
    ).toHaveLength(366);
  });

  it("rejects a range longer than 366 days", () => {
    expect(() =>
      expandOccurrences(series, range("2026-01-01", "2027-01-03")),
    ).toThrow(RangeError);
  });

  it("rejects an empty, reversed or invalid range", () => {
    expect(() =>
      expandOccurrences(series, range("2026-01-01", "2026-01-01")),
    ).toThrow(RangeError);
    expect(() =>
      expandOccurrences(series, range("2026-01-02", "2026-01-01")),
    ).toThrow(RangeError);
    expect(() =>
      expandOccurrences(series, range("2026-02-30", "2026-03-01")),
    ).toThrow(RangeError);
  });

  it("rejects a stored rule outside the subset", () => {
    expect(() =>
      expandOccurrences(
        allDay("FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1", "2026-01-05", "2026-01-06"),
        range("2026-01-01", "2026-02-01"),
      ),
    ).toThrow(RangeError);
  });
});

describe("occurrence helpers", () => {
  it("finds the start the rule generates on a local date", () => {
    const series = timed("FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-26", "09:00");
    expect(seriesStartDate(series)).toBe("2026-10-26");
    // After New York falls back on 1 November, 09:00 is 14:00 UTC.
    expect(occurrenceStartOn(series, "2026-11-02")).toEqual(
      new Date("2026-11-02T14:00:00Z"),
    );
    expect(occurrenceStartOn(series, "2026-11-03")).toBeNull();
    expect(occurrenceStartOn(series, "2026-10-19")).toBeNull();

    const days = allDay(
      "FREQ=MONTHLY;BYMONTHDAY=31",
      "2026-01-31",
      "2026-02-01",
    );
    expect(occurrenceStartOn(days, "2026-03-31")).toBe("2026-03-31");
    expect(occurrenceStartOn(days, "2026-04-30")).toBeNull();
  });

  it("keeps the stored instant on the series' own first date", () => {
    // 01:30 happens twice on 1 November; the later one is the start here.
    const startAt = new Date("2026-11-01T06:30:00Z");
    const series: TimedSeries = {
      allDay: false,
      rrule: "FREQ=DAILY",
      startAt,
      endAt: new Date("2026-11-01T07:00:00Z"),
      tz: NEW_YORK,
    };
    expect(occurrenceStartOn(series, "2026-11-01")).toEqual(startAt);
  });

  it("counts the occurrences before a date, the start included", () => {
    const series = allDay(
      "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10",
      "2026-10-05",
      "2026-10-06",
    );
    expect(countOccurrencesBefore(series, "2026-10-05")).toBe(0);
    expect(countOccurrencesBefore(series, "2026-10-12")).toBe(2);
    expect(countOccurrencesBefore(series, "2027-01-01")).toBe(10);
  });

  it("ends a rule before a date, or after a count, keeping its other parts", () => {
    expect(endRuleBefore("FREQ=WEEKLY;BYDAY=MO;COUNT=5", "2026-11-01")).toBe(
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261031",
    );
    expect(endRuleBefore("FREQ=DAILY;INTERVAL=2", "2026-01-01")).toBe(
      "FREQ=DAILY;INTERVAL=2;UNTIL=20251231",
    );
    expect(ruleWithCount("FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20261231", 3)).toBe(
      "FREQ=MONTHLY;BYDAY=-1FR;COUNT=3",
    );
  });
});

describe("describeRecurrence", () => {
  const en = (rule: string, start = "2026-01-05") =>
    describeRecurrence(rule, { start, locale: "en-GB" });

  it("summarises each pattern in plain language", () => {
    expect(en("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261220")).toBe(
      "Every 2 weeks on Mon and Thu, until 20 Dec 2026",
    );
    expect(en("FREQ=DAILY")).toBe("Every day");
    expect(en("FREQ=DAILY;INTERVAL=3;COUNT=1")).toBe("Every 3 days, once");
    expect(en("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10")).toBe(
      "Every week on Mon, Wed and Fri, 10 times",
    );
    expect(en("FREQ=MONTHLY;BYMONTHDAY=2")).toBe("Every month on the 2nd");
    expect(en("FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=11")).toBe(
      "Every 6 months on the 11th",
    );
    expect(en("FREQ=MONTHLY;BYMONTHDAY=31")).toBe(
      "Every month on the 31st (not in shorter months)",
    );
    expect(en("FREQ=MONTHLY;BYDAY=-1FR")).toBe(
      "Every month on the last Friday",
    );
    expect(en("FREQ=MONTHLY;BYDAY=2TU")).toBe(
      "Every month on the second Tuesday",
    );
    expect(en("FREQ=YEARLY", "2026-07-14")).toBe("Every year on 14 Jul");
    expect(en("FREQ=YEARLY", "2028-02-29")).toBe(
      "Every year on 29 Feb (leap years only)",
    );
  });

  it("formats dates in the user's locale and accepts builder values", () => {
    expect(
      describeRecurrence(
        {
          frequency: "yearly",
          interval: 2,
          end: { type: "until", until: "2030-12-20" },
        },
        { start: "2026-02-28", locale: "en-US" },
      ),
    ).toBe("Every 2 years on Feb 28, until Dec 20, 2030");
  });
});
