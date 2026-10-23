import { describe, expect, it } from "vitest";

import { calendarEventTiming } from "./calendar-events";

const NEW_YORK = "America/New_York";

describe("calendarEventTiming", () => {
  it("stores an all-day event's inclusive end as the next day", () => {
    expect(
      calendarEventTiming({
        allDay: true,
        startDate: "2026-10-24",
        endDate: "2026-10-26",
      }),
    ).toEqual({
      allDay: true,
      startAt: null,
      endAt: null,
      tz: null,
      startDate: "2026-10-24",
      endDate: "2026-10-27",
    });
  });

  it("stores a one-day all-day event as one day, across a month end", () => {
    expect(
      calendarEventTiming({
        allDay: true,
        startDate: "2026-12-31",
        endDate: "2026-12-31",
      }),
    ).toMatchObject({ startDate: "2026-12-31", endDate: "2027-01-01" });
  });

  it("stores a timed event as UTC instants of its zone's wall-clock times", () => {
    expect(
      calendarEventTiming({
        allDay: false,
        startDate: "2026-10-23",
        startTime: "22:00",
        endDate: "2026-10-24",
        endTime: "01:30",
        tz: NEW_YORK,
      }),
    ).toEqual({
      allDay: false,
      startAt: new Date("2026-10-24T02:00:00Z"),
      endAt: new Date("2026-10-24T05:30:00Z"),
      tz: NEW_YORK,
      startDate: null,
      endDate: null,
    });
  });

  it("keeps elapsed time true across New York's DST changes", () => {
    // 2027-03-14: clocks go 02:00 → 03:00, so 01:00–04:00 is two hours.
    const spring = calendarEventTiming({
      allDay: false,
      startDate: "2027-03-14",
      startTime: "01:00",
      endDate: "2027-03-14",
      endTime: "04:00",
      tz: NEW_YORK,
    });
    expect(spring.startAt).toEqual(new Date("2027-03-14T06:00:00Z"));
    expect(spring.endAt).toEqual(new Date("2027-03-14T08:00:00Z"));

    // 2026-11-01: clocks go 02:00 → 01:00, so 00:00–03:00 is four hours.
    const fall = calendarEventTiming({
      allDay: false,
      startDate: "2026-11-01",
      startTime: "00:00",
      endDate: "2026-11-01",
      endTime: "03:00",
      tz: NEW_YORK,
    });
    expect(fall.startAt).toEqual(new Date("2026-11-01T04:00:00Z"));
    expect(fall.endAt).toEqual(new Date("2026-11-01T08:00:00Z"));
  });

  it("moves a time in the spring gap forward and takes the earlier repeated time", () => {
    const gap = calendarEventTiming({
      allDay: false,
      startDate: "2027-03-14",
      startTime: "02:30",
      endDate: "2027-03-14",
      endTime: "03:30",
      tz: NEW_YORK,
    });
    // 02:30 doesn't exist; "compatible" gives 03:30 EDT, the same as the end.
    expect(gap.startAt).toEqual(new Date("2027-03-14T07:30:00Z"));
    expect(gap.endAt).toEqual(new Date("2027-03-14T07:30:00Z"));

    const overlap = calendarEventTiming({
      allDay: false,
      startDate: "2026-11-01",
      startTime: "01:30",
      endDate: "2026-11-01",
      endTime: "02:00",
      tz: NEW_YORK,
    });
    // 01:30 happens twice; the first (EDT) is used. 02:00 is EST.
    expect(overlap.startAt).toEqual(new Date("2026-11-01T05:30:00Z"));
    expect(overlap.endAt).toEqual(new Date("2026-11-01T07:00:00Z"));
  });
});
