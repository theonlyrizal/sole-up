"use client";

import { useId } from "react";

import { cx, focusRing } from "@/components/ui/cx";

/** A fieldset of choices with its legend and an error under it. */
export function ChoiceGroup({
  id,
  legend,
  errors,
  children,
}: {
  id: string;
  legend: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  const errorId = errors?.length ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      aria-describedby={errorId}
      data-invalid={errorId ? "" : undefined}
      className="flex flex-col gap-2"
    >
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      {children}
      {errorId && (
        <p id={errorId} className="text-sm text-danger">
          {errors!.join(" ")}
        </p>
      )}
    </fieldset>
  );
}

/**
 * A radio with its label, and an optional description under it that is
 * linked with `aria-describedby` rather than read as part of the name.
 */
export function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  name: string;
  value?: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  const descriptionId = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label
        className={cx(
          "flex items-center gap-2",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? descriptionId : undefined}
          onChange={onChange}
          className={cx("size-4 shrink-0 accent-accent", focusRing)}
        />
        <span>{label}</span>
      </label>
      {description && (
        <div id={descriptionId} className="pl-6">
          {description}
        </div>
      )}
    </div>
  );
}
