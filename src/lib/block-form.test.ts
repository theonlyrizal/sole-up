import { describe, expect, it } from "vitest";

import {
  blockFormValuesOf,
  blockKey,
  blockStatusActions,
  blockStatusLabel,
  blockTimesPayload,
  blockValuesAt,
  defaultBlockMinutes,
  movedBlockTimes,
  movedSeriesRule,
  newBlockValues,
  offersCompleteTask,
  offersEndSeries,
  thisBlockBlocker,
  withBlockStartDate,
} from "./block-form";
import { instantFromLocal } from "./dates";

// Tokyo is UTC+9 with no DST; New York changes on 1 November 2026, so
// times there show whether a block keeps its own zone's wall clock.
const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";

const at = (local: string, tz = TOKYO) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, tz);
};

describe("new block values", () => {
  it("lasts the task's estimate, else 60 minutes", () => {
    expect(defaultBlockMinutes(45)).toBe(45);
    expect(defaultBlockMinutes(null)).toBe(60);
  });

  it("starts at the user's next whole hour, not repeating", () => {
    // 23:40 on the 23rd in Tokyo: the next hour is midnight on the 24th.
    const values = newBlockValues(at("2026-10-23 23:40"), TOKYO, 25);
    expect(values).toMatchObject({
      startDate: "2026-10-24",
      startTime: "00:00",
      duration: "25",
      tz: TOKYO,
    });
    expect(values.repeat.frequency).toBe("none");
  });

  it("covers a selected slot in the user's zone", () => {
    // 00:30–01:15 on the 24th in Tokyo, still the 23rd in UTC.
    const values = blockValuesAt(
      new Date("2026-10-23T15:30:00Z"),
      new Date("2026-10-23T16:15:00Z"),
      TOKYO,
    );
    expect(values).toMatchObject({
      startDate: "2026-10-24",
      startTime: "00:30",
      duration: "45",
      tz: TOKYO,
    });
  });
});

describe("blockFormValuesOf", () => {
  it("shows a block in its own zone, with its length and the series' repeat", () => {
    const values = blockFormValuesOf({
      startAt: at("2026-11-02 09:00", NEW_YORK),
      endAt: at("2026-11-02 10:30", NEW_YORK),
      tz: NEW_YORK,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
    expect(values).toMatchObject({
      startDate: "2026-11-02",
      startTime: "09:00",
      duration: "90",
      tz: NEW_YORK,
    });
    expect(values.repeat).toMatchObject({
      frequency: "weekly",
      weekdays: ["MO"],
    });
  });

  it("moves a weekly day with the date", () => {
    const values = blockFormValuesOf({
      startAt: at("2026-11-02 09:00"),
      endAt: at("2026-11-02 10:00"),
      tz: TOKYO,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
    // 4 November 2026 is a Wednesday.
    const moved = withBlockStartDate(values, "2026-11-04");
    expect(moved.startDate).toBe("2026-11-04");
    expect(moved.repeat.weekdays).toEqual(["WE"]);
    expect(moved.duration).toBe("60");
  });
});

describe("payloads", () => {
  it("sends the length as a number, and a blank one as NaN for the server to refuse", () => {
    const values = blockValuesAt(
      at("2026-10-24 09:00"),
      at("2026-10-24 10:00"),
      TOKYO,
    );
    expect(blockTimesPayload(values)).toEqual({
      startDate: "2026-10-24",
      startTime: "09:00",
      durationMinutes: 60,
      tz: TOKYO,
    });
    expect(
      blockTimesPayload({ ...values, duration: " " }).durationMinutes,
    ).toBeNaN();
  });

  it("keeps a moved block's own zone and its elapsed length", () => {
    // Dragged on a Tokyo grid to 23:00 on 31 Oct in New York, across the
    // fall-back night: two hours of elapsed time.
    const start = at("2026-10-31 23:00", NEW_YORK);
    const end = new Date(start.getTime() + 2 * 60 * 60_000);
    expect(movedBlockTimes({ tz: NEW_YORK }, start, end)).toEqual({
      startDate: "2026-10-31",
      startTime: "23:00",
      durationMinutes: 120,
      tz: NEW_YORK,
    });
  });

  it("keeps a length inside a block's bounds", () => {
    const start = at("2026-10-24 09:00");
    expect(movedBlockTimes({ tz: TOKYO }, start, start).durationMinutes).toBe(
      1,
    );
    expect(
      movedBlockTimes(
        { tz: TOKYO },
        start,
        new Date(start.getTime() + 30 * 60 * 60_000),
      ).durationMinutes,
    ).toBe(1440);
  });

  it("addresses a one-off by its ID and an occurrence by its original start", () => {
    expect(blockKey({ id: "a", originalStart: null })).toEqual({ id: "a" });
    expect(
      blockKey({ id: "a", originalStart: new Date("2026-10-24T00:00:00Z") }),
    ).toEqual({ id: "a", originalStart: "2026-10-24T00:00:00.000Z" });
  });
});

describe("movedSeriesRule", () => {
  const monday = {
    startAt: at("2026-11-02 09:00"),
    tz: TOKYO,
  };

  it("swaps a weekly day for the day the occurrence moved to", () => {
    expect(
      movedSeriesRule(
        { ...monday, rrule: "FREQ=WEEKLY;BYDAY=MO,TH" },
        at("2026-11-03 09:00"),
      ),
    ).toBe("FREQ=WEEKLY;BYDAY=TU,TH");
  });

  it("keeps a daily rule and a one-off as they are", () => {
    expect(
      movedSeriesRule(
        { ...monday, rrule: "FREQ=DAILY;COUNT=3" },
        at("2026-11-03 10:00"),
      ),
    ).toBe("FREQ=DAILY;COUNT=3");
    expect(movedSeriesRule({ ...monday, rrule: null }, monday.startAt)).toBe(
      null,
    );
  });
});

describe("status", () => {
  const now = at("2026-10-24 12:00");

  it("reads a past scheduled block as Not marked", () => {
    expect(
      blockStatusLabel(
        { status: "scheduled", endAt: at("2026-10-24 11:00") },
        now,
      ),
    ).toBe("Not marked");
    expect(
      blockStatusLabel(
        { status: "scheduled", endAt: at("2026-10-24 12:30") },
        now,
      ),
    ).toBe("Scheduled");
    expect(
      blockStatusLabel({ status: "done", endAt: at("2026-10-24 11:00") }, now),
    ).toBe("Done");
    expect(
      blockStatusLabel(
        { status: "skipped", endAt: at("2026-10-24 11:00") },
        now,
      ),
    ).toBe("Skipped");
  });

  it("offers every status but the current one", () => {
    expect(blockStatusActions("scheduled").map((a) => a.label)).toEqual([
      "Mark done",
      "Mark skipped",
    ]);
    expect(blockStatusActions("done").map((a) => a.label)).toEqual([
      "Mark skipped",
      "Back to scheduled",
    ]);
  });

  it("offers to complete the task only on a done block of an open task", () => {
    expect(offersCompleteTask({ status: "done", taskStatus: "open" })).toBe(
      true,
    );
    expect(
      offersCompleteTask({ status: "done", taskStatus: "completed" }),
    ).toBe(false);
    expect(offersCompleteTask({ status: "skipped", taskStatus: "open" })).toBe(
      false,
    );
  });

  it("offers to end the series only on a completed task's future occurrences", () => {
    const occurrence = {
      seriesId: "s",
      taskStatus: "completed" as const,
      startAt: at("2026-10-25 09:00"),
    };
    expect(offersEndSeries(occurrence, now)).toBe(true);
    expect(
      offersEndSeries({ ...occurrence, startAt: at("2026-10-24 09:00") }, now),
    ).toBe(false);
    expect(offersEndSeries({ ...occurrence, taskStatus: "open" }, now)).toBe(
      false,
    );
    expect(offersEndSeries({ ...occurrence, seriesId: null }, now)).toBe(false);
  });

  it("blocks This block only for a new repeat", () => {
    expect(thisBlockBlocker(false)).toBeNull();
    expect(thisBlockBlocker(true)).toBe(
      "A new repeat applies to more than one block.",
    );
  });
});
