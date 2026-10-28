import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";

import { quietHoursEndAt, quietHoursOf } from "./quiet-hours";

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
});
