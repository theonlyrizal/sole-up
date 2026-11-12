"use client";

import { useId, useState } from "react";
import { FormField } from "./form-field";
import { IconButton } from "./icon-button";
import { Input } from "./input";

type NumberStepperProps = Omit<
  React.ComponentProps<"input">,
  "type" | "inputMode" | "min" | "max" | "value" | "defaultValue"
> & {
  label: string;
  min: number;
  max: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  hint?: React.ReactNode;
  errors?: string[];
};

export function NumberStepper({
  label,
  min,
  max,
  value,
  defaultValue = "",
  onValueChange,
  onChange,
  id,
  disabled,
  readOnly,
  hint,
  errors,
  ...props
}: NumberStepperProps) {
  const generatedId = useId();
  const [draft, setDraft] = useState(defaultValue);
  const displayValue = value ?? draft;
  const number = displayValue.trim() ? Number(displayValue) : NaN;

  function update(next: string) {
    if (value === undefined) setDraft(next);
    onValueChange?.(next);
  }

  function step(direction: -1 | 1) {
    const next = Number.isFinite(number) ? number + direction : min;
    // Adding a unit preserves the entered precision without floating point noise.
    const fractionDigits = Math.min(
      100,
      displayValue.split(".")[1]?.length ?? 0,
    );
    const rounded = Number(next.toFixed(fractionDigits));
    update(String(Math.min(max, Math.max(min, rounded))));
  }

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
      <IconButton
        icon="remove"
        label={`Decrease ${label}`}
        size={40}
        variant="tonal"
        tooltip={false}
        className="mt-2"
        disabled={disabled || readOnly || number <= min}
        onClick={() => step(-1)}
      />
      <FormField
        id={id ?? generatedId}
        label={label}
        hint={hint}
        errors={errors}
      >
        {(control) => (
          <Input
            {...props}
            {...control}
            aria-describedby={
              [control["aria-describedby"], props["aria-describedby"]]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-invalid={control["aria-invalid"] ?? props["aria-invalid"]}
            type="text"
            inputMode="decimal"
            value={displayValue}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(event) => {
              onChange?.(event);
              update(event.currentTarget.value);
            }}
          />
        )}
      </FormField>
      <IconButton
        icon="add"
        label={`Increase ${label}`}
        size={40}
        variant="tonal"
        tooltip={false}
        className="mt-2"
        disabled={disabled || readOnly || number >= max}
        onClick={() => step(1)}
      />
    </div>
  );
}
