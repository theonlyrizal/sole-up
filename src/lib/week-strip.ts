import { gridHref } from "./calendar-views";
import {
  addDays,
  formatLocalDate,
  startOfWeek,
  type LocalDate,
  type WeekStart,
} from "./dates";

export type WeekStripDay = {
  date: LocalDate;
  weekdayLetter: string;
  dayOfMonth: string;
  fullLabel: string;
  href: string;
};

export function weekDays(
  today: LocalDate,
  weekStart: WeekStart,
  locale: string,
): WeekStripDay[] {
  const start = startOfWeek(today, weekStart);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "narrow",
    timeZone: "UTC",
  });
  const dayOfMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone: "UTC",
  });
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(start, offset);
    const utcDate = new Date(`${date}T12:00:00Z`);
    return {
      date,
      weekdayLetter: weekday.format(utcDate),
      dayOfMonth: dayOfMonth.format(utcDate),
      fullLabel: formatLocalDate(date, locale, "full"),
      href: gridHref("day", date, today),
    };
  });
}
