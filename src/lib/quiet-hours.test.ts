import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";

import { isInQuietHours, quietHoursEndAt, quietHoursOf } from "./quiet-hours";

const ZONE = "America/New_York";
const at = (date: string, time: string) => instantFromLocal(date, time, ZONE);

describe("quietHoursOf", () => {
  it("is off unless both times are set and differ", () => {
    expect(quietHoursOf(null, null)).toBeNull();
    expect(quietHoursOf("22:00", null)).toBeNull();
    expect(quietHoursOf("22:00", "22:00")).toBeNull();
    expect(quietHoursOf("22:00", "07:00")).toEqual({
      start: "22:00",
      end: "07:00",
    });
  });
});

describe("isInQuietHours", () => {
  it("includes the start and excludes the end, across midnight too", () => {
    const overnight = { start: "22:00", end: "07:00" };
    expect(isInQuietHours("22:00", overnight)).toBe(true);
    expect(isInQuietHours("06:59", overnight)).toBe(true);
    expect(isInQuietHours("07:00", overnight)).toBe(false);
    expect(isInQuietHours("12:00", overnight)).toBe(false);
    const afternoon = { start: "13:00", end: "15:00" };
    expect(isInQuietHours("14:00", afternoon)).toBe(true);
    expect(isInQuietHours("15:00", afternoon)).toBe(false);
    expect(isInQuietHours("08:00", afternoon)).toBe(false);
  });
});

describe("quietHoursEndAt", () => {
  const overnight = { start: "22:00", end: "07:00" };
  const afternoon = { start: "13:00", end: "15:00" };

  it("ends tomorrow morning when it is late evening inside hours that cross midnight", () => {
    expect(quietHoursEndAt(at("2027-01-11", "23:30"), ZONE, overnight)).toEqual(
      at("2027-01-12", "07:00"),
    );
    expect(quietHoursEndAt(at("2027-01-11", "22:00"), ZONE, overnight)).toEqual(
      at("2027-01-12", "07:00"),
    );
  });

  it("ends this morning after midnight", () => {
    expect(quietHoursEndAt(at("2027-01-12", "03:00"), ZONE, overnight)).toEqual(
      at("2027-01-12", "07:00"),
    );
  });

  it("is null outside the hours, with the end exclusive", () => {
    expect(
      quietHoursEndAt(at("2027-01-12", "07:00"), ZONE, overnight),
    ).toBeNull();
    expect(
      quietHoursEndAt(at("2027-01-12", "12:00"), ZONE, overnight),
    ).toBeNull();
    expect(
      quietHoursEndAt(at("2027-01-12", "21:59"), ZONE, overnight),
    ).toBeNull();
  });

  it("handles hours within one day", () => {
    expect(quietHoursEndAt(at("2027-01-12", "14:00"), ZONE, afternoon)).toEqual(
      at("2027-01-12", "15:00"),
    );
    expect(
      quietHoursEndAt(at("2027-01-12", "12:59"), ZONE, afternoon),
    ).toBeNull();
    expect(
      quietHoursEndAt(at("2027-01-12", "15:00"), ZONE, afternoon),
    ).toBeNull();
  });

  it("evaluates the hours in the given zone", () => {
    // 04:30 UTC is 23:30 the evening before in New York.
    const now = new Date("2027-01-12T04:30:00.000Z");
    expect(quietHoursEndAt(now, ZONE, overnight)).toEqual(
      at("2027-01-12", "07:00"),
    );
    expect(quietHoursEndAt(now, "UTC", overnight)).toEqual(
      new Date("2027-01-12T07:00:00.000Z"),
    );
  });

  it("ends at the local time across a DST change", () => {
    // Spring forward in New York on Sunday 14 March 2027.
    expect(quietHoursEndAt(at("2027-03-13", "23:00"), ZONE, overnight)).toEqual(
      new Date("2027-03-14T11:00:00.000Z"),
    );
  });

  it("ends when the clock jumps past an end that spring-forward skips", () => {
    // 02:30 doesn't exist on 14 March 2027; 01:59 EST is followed by 03:00
    // EDT (07:00 UTC).
    const hours = { start: "01:00", end: "02:30" };
    expect(
      quietHoursEndAt(new Date("2027-03-14T06:45:00.000Z"), ZONE, hours),
    ).toEqual(new Date("2027-03-14T07:00:00.000Z"));
  });

  it("is over in the repeated fall-back hour once the first end has passed", () => {
    // 01:30 happens twice on 7 November 2027: EDT (05:30 UTC), then EST.
    const hours = { start: "00:00", end: "01:30" };
    expect(
      quietHoursEndAt(new Date("2027-11-07T05:15:00.000Z"), ZONE, hours),
    ).toEqual(new Date("2027-11-07T05:30:00.000Z"));
    // 01:15 EST, the second time the clock reads it.
    expect(
      quietHoursEndAt(new Date("2027-11-07T06:15:00.000Z"), ZONE, hours),
    ).toBeNull();
  });
});
