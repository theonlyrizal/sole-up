import type { HabitHistoryDay } from "@/server/modules/habits/queries";

const appearances = {
  done: { className: "habit-mark-done", glyph: "✓", label: "Done" },
  partial: {
    className: "habit-mark-partial",
    glyph: "◐",
    label: "Partly done",
  },
  extra: {
    className: "habit-mark-extra",
    glyph: "+",
    label: "Extra, not counted",
  },
  skipped: { className: "habit-mark-skipped", glyph: "−", label: "Skipped" },
  missed: { className: "habit-mark-missed", glyph: null, label: "Missed" },
  unlogged: {
    className: "habit-mark-unlogged",
    glyph: null,
    label: "Not logged",
  },
  today: {
    className: "habit-mark-today",
    glyph: null,
    label: "Today, not logged yet",
  },
  future: { className: "habit-mark-future", glyph: "·", label: "Coming up" },
  inactive: {
    className: "habit-mark-inactive",
    glyph: null,
    label: "Not active",
  },
  not_scheduled: {
    className: "habit-mark-off",
    glyph: "×",
    label: "Not scheduled",
  },
} as const;

export const habitDayLegend = Object.values(appearances);

export function habitDayAppearance({
  state,
  credit,
}: Pick<HabitHistoryDay, "state" | "credit">) {
  return state === "completed"
    ? appearances[credit >= 1 ? "done" : "partial"]
    : appearances[state];
}
