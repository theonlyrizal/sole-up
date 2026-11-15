"use client";

import { InlineBanner } from "@/components/ui/inline-banner";
import { RadioRow } from "@/components/ui/radio-group";

import {
  CALENDAR_EVENT_SCOPES,
  type CalendarEventScope,
} from "@/lib/calendar-events";
import { formatInstant, formatLocalDate } from "@/lib/dates";
import type { DroppedException } from "@/server/modules/calendar-events/service";

/** What repeats: an event (chunk 4.4) or a time block (chunk 4.8). */
export type ScopeNoun = "event" | "block";

const SCOPE_LABELS: Record<ScopeNoun, Record<CalendarEventScope, string>> = {
  event: {
    this: "This event",
    following: "This and following events",
    all: "All events",
  },
  block: {
    this: "This block",
    following: "This and following blocks",
    all: "All blocks",
  },
};

/** What one scope would do: why it can't be used, or what it would drop. */
export type ScopeOption = {
  /** Why this scope can't take the change; the option is disabled. */
  blocker?: string | null;
  /** The occurrences with their own changes that it would drop. */
  dropped?: Pick<DroppedException, "id" | "kind" | "originalStart">[];
};

type ScopeChooserProps = {
  id: string;
  legend: string;
  /** "change" for an edit, "delete" for a delete: words the dropped list. */
  action: "change" | "delete";
  value: CalendarEventScope;
  onChange: (scope: CalendarEventScope) => void;
  options: Partial<Record<CalendarEventScope, ScopeOption>>;
  /** True while the dropped occurrences are still being worked out. */
  loading: boolean;
  locale: string;
  timeZone: string;
  /** What the options name; events unless given. */
  noun?: ScopeNoun;
};

/**
 * Asks which occurrences of a repeating event or block an edit or delete applies to
 * (ADR 0012), naming the occurrences with their own changes that each
 * choice would drop. Native radios: arrow keys move between them.
 */
export function ScopeChooser({
  id,
  legend,
  action,
  value,
  onChange,
  options,
  loading,
  locale,
  timeZone,
  noun = "event",
}: ScopeChooserProps) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-title-medium">{legend}</legend>
      {CALENDAR_EVENT_SCOPES.map((scope) => {
        const option = options[scope];
        const dropped = option?.dropped ?? [];
        const warningId =
          dropped.length > 0 ? `${id}-${scope}-warning` : undefined;
        return (
          <div key={scope}>
            <RadioRow
              native
              name={id}
              value={scope}
              checked={value === scope}
              onChange={() => onChange(scope)}
              disabled={Boolean(option?.blocker)}
              label={SCOPE_LABELS[noun][scope]}
              description={option?.blocker || undefined}
              aria-describedby={warningId}
            />
            {warningId && (
              <div className="mb-2" id={warningId}>
                <DroppedList
                  noun={noun}
                  action={action}
                  dropped={dropped}
                  locale={locale}
                  timeZone={timeZone}
                />
              </div>
            )}
          </div>
        );
      })}
      {loading && (
        <p
          role="status"
          className="text-body-medium text-on-surface-variant"
        >{`Checking for ${noun}s you changed separately…`}</p>
      )}
    </fieldset>
  );
}

function DroppedList({
  noun,
  action,
  dropped,
  locale,
  timeZone,
}: {
  noun: ScopeNoun;
  action: "change" | "delete";
  dropped: NonNullable<ScopeOption["dropped"]>;
  locale: string;
  timeZone: string;
}) {
  if (dropped.length === 0) return null;
  const events =
    dropped.length === 1 ? `1 ${noun}` : `${dropped.length} ${noun}s`;
  return (
    <InlineBanner tone="warning" role="status">
      <p>
        {action === "change"
          ? `${events} you changed separately won't keep those changes:`
          : `This also removes ${events} you changed separately:`}
      </p>
      <ul className="mt-1 list-disc ps-5">
        {dropped.map((exception) => (
          <li key={exception.id}>
            {droppedLabel(exception, locale, timeZone)}
          </li>
        ))}
      </ul>
    </InlineBanner>
  );
}

/** "Tue, 4 Nov 2026, 09:00 (edited)" or "6 Nov 2026 (deleted)". */
function droppedLabel(
  exception: NonNullable<ScopeOption["dropped"]>[number],
  locale: string,
  timeZone: string,
): string {
  const when =
    exception.originalStart instanceof Date
      ? formatInstant(exception.originalStart, locale, timeZone)
      : formatLocalDate(exception.originalStart, locale);
  return `${when} (${exception.kind === "cancelled" ? "deleted" : "edited"})`;
}
