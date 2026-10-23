import Link from "next/link";

import { cx, focusRing } from "@/components/ui/cx";
import { agendaHref, DEFAULT_AGENDA_DAYS } from "@/lib/agenda";
import {
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  type CalendarView,
  gridHref,
} from "@/lib/calendar-views";
import type { LocalDate } from "@/lib/dates";

/** The calendar page's pill links (views, ranges and moves). */
export const pillClass = (current: boolean) =>
  cx(
    "inline-flex rounded-md border px-3 py-1.5 text-sm",
    current
      ? "border-accent font-medium text-fg"
      : "border-border text-muted hover:text-fg",
    focusRing,
  );

/**
 * Agenda, Week and Day. Switching keeps the day the user is looking at:
 * the Agenda starts on it, Week holds it and Day shows it. Week is not
 * offered on phone widths, where Day stands in for it.
 */
export function ViewNav({
  current,
  date,
  today,
}: {
  current: CalendarView;
  /** The day to carry over to the other views. */
  date: LocalDate;
  today: LocalDate;
}) {
  const href = (view: CalendarView) =>
    view === "agenda"
      ? agendaHref({ start: date, days: DEFAULT_AGENDA_DAYS }, today)
      : gridHref(view, date, today);
  return (
    <nav aria-label="Calendar view">
      <ul className="flex flex-wrap gap-1">
        {CALENDAR_VIEWS.map((view) => (
          <li key={view} className={view === "week" ? "max-md:hidden" : ""}>
            <Link
              href={href(view)}
              aria-current={view === current ? "page" : undefined}
              className={pillClass(view === current)}
            >
              {CALENDAR_VIEW_LABELS[view]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
