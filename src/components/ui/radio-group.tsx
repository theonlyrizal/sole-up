"use client";

import { useId } from "react";
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { cx, focusRing } from "./cx";
import { SelectionRow } from "./selection-row";

type RadioGroupProps = React.ComponentProps<typeof RadioPrimitive.Root> & {
  label: string;
};

export function RadioGroup({ label, className, ...props }: RadioGroupProps) {
  return (
    <RadioPrimitive.Root
      {...props}
      aria-label={label}
      className={cx("flex min-w-0 flex-col", className)}
    />
  );
}

type RadioRowProps = Omit<
  React.ComponentProps<typeof RadioPrimitive.Item>,
  "children"
> & { label: string; description?: string };

export function RadioRow({
  label,
  description,
  id,
  className,
  ...props
}: RadioRowProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <SelectionRow
      id={controlId}
      label={label}
      description={description}
      className={className}
    >
      <RadioPrimitive.Item
        {...props}
        id={controlId}
        aria-labelledby={`${controlId}-label`}
        aria-describedby={
          description ? `${controlId}-description` : props["aria-describedby"]
        }
        className={cx(
          "selection-control state-layer grid size-12 place-items-center rounded-full disabled:cursor-not-allowed",
          focusRing,
        )}
      >
        <span className="radio-mark grid size-5 place-items-center rounded-full">
          <RadioPrimitive.Indicator className="size-2.5 rounded-full bg-current" />
        </span>
      </RadioPrimitive.Item>
    </SelectionRow>
  );
}
