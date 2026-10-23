import { describe, expect, it } from "vitest";

import {
  addDays,
  dayOfWeek,
  daysBetween,
  formatInstant,
  formatLocalDate,
  formatTimeOfDay,
  instantFromLocal,
  isLocalDate,
  localDateOf,
  localDateTimeOf,
  localDayRange,
  startOfLocalDay,
  startOfWeek,
  todayFor,
} from "./dates";

const at = (iso: string) => new Date(iso);

describe("todayFor near midnight", () => {
  // Each case: one second before and at the zone's local midnight.
  const cases = [
    // UTC−7 in October (PDT).
    {
      zone: "America/Los_Angeles",
      before: "2026-10-21T06:59:59Z",
      at: "2026-10-21T07:00:00Z",
      day: "2026-10-21",
    },
    // UTC+9, no DST.
    {
      zone: "Asia/Tokyo",
      before: "2026-10-20T14:59:59Z",
      at: "2026-10-20T15:00:00Z",
      day: "2026-10-21",
    },
    // UTC+5:30, a half-hour offset.
    {
      zone: "Asia/Kolkata",
      before: "2026-10-20T18:29:59Z",
      at: "2026-10-20T18:30:00Z",
      day: "2026-10-21",
    },
    // UTC+13:45 in its summer (southern hemisphere DST), a quarter-hour offset.
    {
      zone: "Pacific/Chatham",
      before: "2026-12-31T10:14:59Z",
      at: "2026-12-31T10:15:00Z",
      day: "2027-01-01",
    },
    // UTC+14, the earliest zone.
    {
      zone: "Pacific/Kiritimati",
      before: "2026-10-20T09:59:59Z",
      at: "2026-10-20T10:00:00Z",
      day: "2026-10-21",
    },
    // UTC−11, among the latest.
    {
      zone: "Pacific/Pago_Pago",
      before: "2026-10-21T10:59:59Z",
      at: "2026-10-21T11:00:00Z",
      day: "2026-10-21",
    },
    {
      zone: "UTC",
      before: "2026-10-20T23:59:59Z",
      at: "2026-10-21T00:00:00Z",
      day: "2026-10-21",
    },
  ];

  it.each(cases)(
    "$zone rolls over at its own midnight",
    ({ zone, before, at: atMidnight, day }) => {
      expect(todayFor(zone, at(before))).toBe(addDays(day, -1));
      expect(todayFor(zone, at(atMidnight))).toBe(day);
    },
  );

  it("gives different dates for the same instant in different zones", () => {
    const instant = at("2026-10-20T23:30:00Z");
    expect(todayFor("America/New_York", instant)).toBe("2026-10-20");
    expect(todayFor("Europe/London", instant)).toBe("2026-10-21");
    expect(todayFor("Asia/Tokyo", instant)).toBe("2026-10-21");
  });

  it("follows DST: New York midnight is 04:00 UTC in summer and 05:00 in winter", () => {
    expect(todayFor("America/New_York", at("2026-07-01T03:59:59Z"))).toBe(
      "2026-06-30",
    );
    expect(todayFor("America/New_York", at("2026-07-01T04:00:00Z"))).toBe(
      "2026-07-01",
    );
    expect(todayFor("America/New_York", at("2026-12-01T04:59:59Z"))).toBe(
      "2026-11-30",
    );
    expect(todayFor("America/New_York", at("2026-12-01T05:00:00Z"))).toBe(
      "2026-12-01",
    );
  });

  it("handles a day where midnight doesn't exist (Santiago springs forward at 00:00)", () => {
    // Chile moves 00:00 → 01:00 on 2026-09-06; that day starts at 04:00 UTC.
    expect(todayFor("America/Santiago", at("2026-09-06T03:59:59Z"))).toBe(
      "2026-09-05",
    );
    expect(todayFor("America/Santiago", at("2026-09-06T04:00:00Z"))).toBe(
      "2026-09-06",
    );
  });

  it("defaults to the current time", () => {
    expect(isLocalDate(todayFor("UTC"))).toBe(true);
  });

  it("throws for an unknown zone or an invalid instant", () => {
    expect(() => todayFor("Mars/Olympus_Mons")).toThrow(RangeError);
    expect(() => todayFor("UTC", new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("local date and instant conversion", () => {
  it("converts local wall time to an instant and back", () => {
    const instant = instantFromLocal("2026-10-20", "09:30", "Europe/Berlin");
    expect(instant.toISOString()).toBe("2026-10-20T07:30:00.000Z");
    expect(localDateTimeOf(instant, "Europe/Berlin")).toEqual({
      date: "2026-10-20",
      time: "09:30",
    });
    expect(localDateOf(instant, "Pacific/Pago_Pago")).toBe("2026-10-19");
  });

  it("moves a time in a spring-forward gap forward by the gap", () => {
    // New York skips 02:00–03:00 on 2026-03-08.
    expect(
      instantFromLocal("2026-03-08", "02:30", "America/New_York").toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves a repeated fall-back time to the earlier occurrence", () => {
    // New York repeats 01:00–02:00 on 2026-11-01; the first is EDT (UTC−4).
    expect(
      instantFromLocal("2026-11-01", "01:30", "America/New_York").toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  it("rejects malformed dates and times", () => {
    expect(() => instantFromLocal("2026-02-30", "09:00", "UTC")).toThrow(
      RangeError,
    );
    expect(() => instantFromLocal("2026-10-20", "24:00", "UTC")).toThrow(
      RangeError,
    );
    expect(() => instantFromLocal("2026-10-20", "9am", "UTC")).toThrow(
      RangeError,
    );
  });

  it("gives a day's instant range, 23 or 25 hours on DST days", () => {
    const hours = (date: string, zone: string) => {
      const { start, end } = localDayRange(date, zone);
      return (end.getTime() - start.getTime()) / 3_600_000;
    };
    expect(hours("2026-10-20", "Europe/Berlin")).toBe(24);
    expect(hours("2026-03-29", "Europe/Berlin")).toBe(23);
    expect(hours("2026-10-25", "Europe/Berlin")).toBe(25);
  });

  it("starts a day at 01:00 when DST skips midnight", () => {
    expect(
      startOfLocalDay("2026-09-06", "America/Santiago").toISOString(),
    ).toBe("2026-09-06T04:00:00.000Z");
  });
});

describe("calendar arithmetic", () => {
  it("validates local dates", () => {
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2026-1-5")).toBe(false);
    expect(isLocalDate("2026-10-20T00:00")).toBe(false);
  });

  it("adds days across months, years and DST changes", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(() => addDays("2026-10-20", 1.5)).toThrow(RangeError);
  });

  it("counts calendar days between dates, ignoring DST", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-12-31", "2028-01-01")).toBe(366);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
    expect(daysBetween("2026-10-20", "2026-10-18")).toBe(-2);
  });

  it("numbers days of the week from Sunday = 0", () => {
    expect(dayOfWeek("2026-10-18")).toBe(0);
    expect(dayOfWeek("2026-10-20")).toBe(2);
    expect(dayOfWeek("2026-10-24")).toBe(6);
  });

  it("finds the start of the week for any week start", () => {
    // 2026-10-20 is a Tuesday.
    expect(startOfWeek("2026-10-20", 1)).toBe("2026-10-19");
    expect(startOfWeek("2026-10-20", 0)).toBe("2026-10-18");
    expect(startOfWeek("2026-10-20", 6)).toBe("2026-10-17");
    expect(startOfWeek("2026-10-20", 2)).toBe("2026-10-20");
    expect(startOfWeek("2026-10-20", 3)).toBe("2026-10-14");
    // Across a year boundary.
    expect(startOfWeek("2027-01-01", 1)).toBe("2026-12-28");
  });
});

describe("formatLocalDate", () => {
  it("formats the calendar date in the user's locale", () => {
    expect(formatLocalDate("2027-03-12", "en-GB")).toBe("12 Mar 2027");
    expect(formatLocalDate("2027-03-12", "en-US")).toBe("Mar 12, 2027");
  });

  it("never shifts the day, whatever the process time zone", () => {
    expect(formatLocalDate("2027-01-01", "en-GB")).toBe("1 Jan 2027");
    expect(formatLocalDate("2026-12-31", "en-GB")).toBe("31 Dec 2026");
  });

  it("rejects an invalid date", () => {
    expect(() => formatLocalDate("2027-02-30", "en-GB")).toThrow(RangeError);
  });
});

describe("formatTimeOfDay", () => {
  it("shows the wall-clock time in the user's time zone", () => {
    const instant = at("2027-03-12T23:30:00Z");
    expect(formatTimeOfDay(instant, "en-GB", "UTC")).toBe("23:30");
    expect(formatTimeOfDay(instant, "en-GB", "Asia/Jakarta")).toBe("06:30");
    expect(formatTimeOfDay(instant, "en-US", "Asia/Jakarta")).toMatch(
      /^6:30\sAM$/,
    );
  });

  it("rejects an invalid instant", () => {
    expect(() => formatTimeOfDay(new Date(Number.NaN), "en-GB", "UTC")).toThrow(
      RangeError,
    );
  });
});

describe("formatInstant", () => {
  it("shows the wall-clock time in the user's time zone", () => {
    const instant = at("2027-03-12T23:30:00Z");
    expect(formatInstant(instant, "en-GB", "UTC")).toBe("12 Mar 2027, 23:30");
    expect(formatInstant(instant, "en-GB", "Asia/Jakarta")).toBe(
      "13 Mar 2027, 06:30",
    );
  });

  it("rejects an invalid instant", () => {
    expect(() => formatInstant(new Date(Number.NaN), "en-GB", "UTC")).toThrow(
      RangeError,
    );
  });
});
