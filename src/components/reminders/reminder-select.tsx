import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import {
  REMINDER_EARLY_HINT,
  REMINDER_OFFSET_LABELS,
  REMINDER_OFFSETS,
} from "@/lib/reminders";

/**
 * The task and event forms' reminder choice (ADR 0013): none, or one of the
 * fixed offsets. The value is the select's string ("" for none), which the
 * actions accept as is. The hint always says reminders may come early,
 * after anything the form adds in `note`.
 */
export function ReminderSelect({
  id,
  value,
  onChange,
  errors,
  note,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  note?: string;
}) {
  return (
    <FormField
      id={id}
      label="Reminder"
      hint={note ? `${note} ${REMINDER_EARLY_HINT}` : REMINDER_EARLY_HINT}
      errors={errors}
    >
      {(control) => (
        <Select
          {...control}
          name="reminderOffsetMinutes"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">None</option>
          {REMINDER_OFFSETS.map((offset) => (
            <option key={offset} value={offset}>
              {REMINDER_OFFSET_LABELS[offset]}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
}
