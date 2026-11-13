import { cx } from "@/components/ui/cx";
import type { LocalDate } from "@/lib/dates";

export function DateBadge({
  date,
  locale,
  today,
  label,
  relative,
}: {
  date: LocalDate;
  locale: string;
  today: LocalDate;
  label: string;
  relative?: string;
}) {
  const day = new Date(`${date}T00:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    day.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  return (
    <time dateTime={date} aria-current={date === today ? "date" : undefined}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="text-title-medium medium:hidden">
        {format({ weekday: "short", day: "numeric", month: "short" })}
        {relative && ` · ${relative}`}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "hidden w-18 flex-col items-center gap-0.5 rounded-xl px-2 py-2 medium:flex",
          date === today
            ? "bg-primary text-on-primary"
            : "bg-surface-container text-on-surface",
        )}
      >
        <span className="text-label-small">{format({ weekday: "short" })}</span>
        <span className="text-title-large tabular-nums">
          {format({ day: "numeric" })}
        </span>
        <span className="text-label-small">{format({ month: "short" })}</span>
      </span>
    </time>
  );
}
