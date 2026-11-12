import { expect, it } from "vitest";
import { addDays, todayFor, type WeekStart } from "./dates";
import { weekDays } from "./week-strip";

it.each([0, 1, 2, 3, 4, 5, 6] as const)(
  "starts the local week on weekday %s",
  (weekStart: WeekStart) => {
    const days = weekDays("2026-11-07", weekStart, "en-GB");
    expect(days.map(({ date }) => date)).toEqual(
      Array.from({ length: 7 }, (_, index) =>
        addDays("2026-11-01", weekStart + index),
      ),
    );
    expect(days.find(({ date }) => date === "2026-11-07")?.href).toBe(
      "/plan/calendar?view=day",
    );
  },
);

it.each([
  ["2026-03-08T07:00:00Z", "2026-03-06", "2026-03-12"],
  ["2026-11-01T06:00:00Z", "2026-10-30", "2026-11-05"],
])(
  "keeps consecutive local dates across New York's clock change at %s",
  (instant, start, end) => {
    const today = todayFor("America/New_York", new Date(instant));
    const days = weekDays(today, 5, "en-GB");
    expect(days.map(({ date }) => date)).toEqual(
      Array.from({ length: 7 }, (_, index) => addDays(start, index)),
    );
    expect(days.at(-1)?.date).toBe(end);
  },
);

it("localizes the capsule and its full date label", () => {
  const [day] = weekDays("2026-11-13", 1, "ja-JP");
  expect(day).toMatchObject({
    weekdayLetter: "月",
    dayOfMonth: "9日",
    fullLabel: "2026年11月9日月曜日",
    href: "/plan/calendar?view=day&date=2026-11-09",
  });
});
