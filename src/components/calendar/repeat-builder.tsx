"use client";

import { cx, focusRing } from "@/components/ui/cx";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  monthlyOnKey,
  monthlyOnLabel,
  monthlyOptions,
  REPEAT_UNITS,
  type RepeatEnds,
  type RepeatErrors,
  type RepeatFrequency,
  type RepeatValues,
  repeatSummary,
} from "@/lib/event-form";
import {
  RECURRENCE_COUNT_MAX,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_WEEKDAYS,
  type RecurrenceWeekday,
} from "@/lib/recurrence-rules";

import { ChoiceGroup, Radio } from "./choices";

const FREQUENCY_LABELS: Record<RepeatFrequency, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const WEEKDAY_LABELS: Record<RecurrenceWeekday, [string, string]> = {
  MO: ["Mon", "Monday"],
  TU: ["Tue", "Tuesday"],
  WE: ["Wed", "Wednesday"],
  TH: ["Thu", "Thursday"],
  FR: ["Fri", "Friday"],
  SA: ["Sat", "Saturday"],
  SU: ["Sun", "Sunday"],
};

const ENDS_LABELS: Record<RepeatEnds, string> = {
  never: "Never",
  count: "After a number of times",
  until: "On a date",
};

type RepeatBuilderProps = {
  /** Prefix for the controls' ids (from `useId()`). */
  id: string;
  value: RepeatValues;
  onChange: (next: RepeatValues) => void;
  /** The event's start date: the monthly choices and summary depend on it. */
  startDate: string;
  locale: string;
  errors: RepeatErrors;
  /** Errors the server returned for the rule as a whole. */
  ruleErrors?: string[];
};

/**
 * The repeat builder (ADR 0012): daily, weekly on chosen weekdays, monthly
 * by day or nth/last weekday, yearly, every N, ending never, after N times
 * or on a date. Native controls only, so it is keyboard operable as is.
 */
export function RepeatBuilder({
  id,
  value,
  onChange,
  startDate,
  locale,
  errors,
  ruleErrors,
}: RepeatBuilderProps) {
  const set = (patch: Partial<RepeatValues>) =>
    onChange({ ...value, ...patch });
  const summary = repeatSummary(value, startDate, locale);
  const summaryId = `${id}-summary`;
  const ruleErrorId = `${id}-rule-error`;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <FormField
        id={`${id}-frequency`}
        label="Repeat"
        errors={errors.frequency}
      >
        {(control) => (
          <Select
            {...control}
            aria-describedby={
              [control["aria-describedby"], summary && summaryId]
                .filter(Boolean)
                .join(" ") || undefined
            }
            value={value.frequency}
            onChange={(event) =>
              set({ frequency: event.target.value as RepeatFrequency })
            }
          >
            {(Object.keys(FREQUENCY_LABELS) as RepeatFrequency[]).map(
              (frequency) => (
                <option key={frequency} value={frequency}>
                  {FREQUENCY_LABELS[frequency]}
                </option>
              ),
            )}
          </Select>
        )}
      </FormField>

      {value.frequency !== "none" && (
        <>
          <FormField
            id={`${id}-interval`}
            label={`Repeat every (${REPEAT_UNITS[value.frequency][1]})`}
            errors={errors.interval}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                max={RECURRENCE_INTERVAL_MAX}
                step={1}
                value={value.interval}
                className="w-28"
                onChange={(event) => set({ interval: event.target.value })}
              />
            )}
          </FormField>

          {value.frequency === "weekly" && (
            <ChoiceGroup
              id={`${id}-weekdays`}
              legend="On these days"
              errors={errors.weekdays}
            >
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {RECURRENCE_WEEKDAYS.map((day) => (
                  <label key={day} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={value.weekdays.includes(day)}
                      aria-label={WEEKDAY_LABELS[day][1]}
                      onChange={(event) =>
                        set({
                          weekdays: event.target.checked
                            ? [...value.weekdays, day]
                            : value.weekdays.filter((other) => other !== day),
                        })
                      }
                      className={cx("size-4 accent-accent", focusRing)}
                    />
                    <span aria-hidden="true">{WEEKDAY_LABELS[day][0]}</span>
                  </label>
                ))}
              </div>
            </ChoiceGroup>
          )}

          {value.frequency === "monthly" && (
            <ChoiceGroup
              id={`${id}-monthly`}
              legend="Day of the month"
              errors={errors.monthlyOn}
            >
              {monthlyOptions(startDate, value.monthlyOn).map((option) => {
                const key = monthlyOnKey(option);
                return (
                  <Radio
                    key={key}
                    name={`${id}-monthly`}
                    checked={key === monthlyOnKey(value.monthlyOn)}
                    onChange={() => set({ monthlyOn: option })}
                    label={monthlyOnLabel(option)}
                  />
                );
              })}
            </ChoiceGroup>
          )}

          <ChoiceGroup id={`${id}-ends`} legend="Ends">
            {(Object.keys(ENDS_LABELS) as RepeatEnds[]).map((ends) => (
              <Radio
                key={ends}
                name={`${id}-ends`}
                checked={value.ends === ends}
                onChange={() => set({ ends })}
                label={ENDS_LABELS[ends]}
              />
            ))}
          </ChoiceGroup>
          {value.ends === "count" && (
            <FormField
              id={`${id}-count`}
              label="Number of times"
              hint="Including the first event."
              errors={errors.count}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={RECURRENCE_COUNT_MAX}
                  step={1}
                  value={value.count}
                  className="w-28"
                  onChange={(event) => set({ count: event.target.value })}
                />
              )}
            </FormField>
          )}
          {value.ends === "until" && (
            <FormField
              id={`${id}-until`}
              label="Last date"
              hint="The last day an event can start on."
              errors={errors.until}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={value.until}
                  min={startDate || undefined}
                  className="w-auto"
                  onChange={(event) => set({ until: event.target.value })}
                />
              )}
            </FormField>
          )}
        </>
      )}

      {summary && (
        <p id={summaryId} className="text-sm text-muted">
          {summary}
        </p>
      )}
      {ruleErrors && ruleErrors.length > 0 && (
        <p id={ruleErrorId} className="text-sm text-danger">
          {ruleErrors.join(" ")}
        </p>
      )}
    </div>
  );
}
