"use client";

import { useContext, useRef } from "react";
import { cx } from "@/components/ui/cx";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { isLocalDate } from "@/lib/dates";
import { DateSelectionDialog } from "./date-selection-dialog";
import { PickerPreferences } from "./picker-preferences";
import { TimeSelectionDialog } from "./time-selection-dialog";

type PickerFieldProps = {
  id: string;
  label: string;
  name?: string;
  value: string;
  locale?: string;
  hint?: string;
  errors?: string[];
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  onChange: (value: string) => void;
} & ({ type: "date"; timeZone?: string; min?: string } | { type: "time" });

export function PickerField(props: PickerFieldProps) {
  const { id, label, name, type, value, hint, errors, onChange } = props;
  const preferences = useContext(PickerPreferences);
  const locale = props.locale ?? preferences.locale;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const min =
    type === "date" && props.min && isLocalDate(props.min)
      ? props.min
      : undefined;
  const context = label
    .toLowerCase()
    .replace(new RegExp(`\\b${type}$`), "")
    .trim();
  const pickerLabel = type === "date" ? "Open calendar" : "Open clock";
  const trigger = (
    <IconButton
      ref={triggerRef}
      icon={type === "date" ? "calendar_month" : "schedule"}
      label={context ? `${pickerLabel} for ${context}` : pickerLabel}
      tooltip={false}
      disabled={props.disabled}
      size={40}
      className="picker-field-trigger"
    />
  );
  const onClear = props.clearable && value ? () => onChange("") : undefined;
  return (
    <FormField id={id} label={label} hint={hint} errors={errors}>
      {(control) => (
        <>
          <Input
            {...control}
            name={name}
            type={type}
            value={value}
            min={min}
            autoFocus={props.autoFocus}
            disabled={props.disabled}
            aria-invalid={props["aria-invalid"] ?? control["aria-invalid"]}
            aria-describedby={
              [control["aria-describedby"], props["aria-describedby"]]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={cx("picker-field-input", props.className)}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "F4" ||
                (event.altKey && event.key === "ArrowDown")
              ) {
                event.preventDefault();
                triggerRef.current?.click();
              }
            }}
            onPointerDown={(event) => {
              if (event.pointerType === "touch") event.preventDefault();
            }}
            onClick={(event) => {
              if (
                event.nativeEvent instanceof PointerEvent &&
                event.nativeEvent.pointerType === "touch"
              ) {
                event.preventDefault();
                triggerRef.current?.click();
              }
            }}
          />
          {type === "date" ? (
            <DateSelectionDialog
              trigger={trigger}
              value={value}
              timeZone={props.timeZone ?? preferences.timeZone}
              weekStart={preferences.weekStart}
              min={min}
              locale={locale}
              onChange={onChange}
              onClear={onClear}
            />
          ) : (
            <TimeSelectionDialog
              trigger={trigger}
              value={value}
              locale={locale}
              onChange={onChange}
              onClear={onClear}
            />
          )}
        </>
      )}
    </FormField>
  );
}
