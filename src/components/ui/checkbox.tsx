"use client";

import { useId } from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Icon } from "@/components/icons/icon";
import { cx, focusRing } from "./cx";
import { SelectionRow } from "./selection-row";

type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  "children"
> & {
  label: string;
  description?: string;
  shape?: "square" | "round";
};

export function Checkbox({
  label,
  description,
  shape = "square",
  id,
  className,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <SelectionRow
      id={controlId}
      label={label}
      description={description}
      leading
      className={className}
    >
      <CheckboxPrimitive.Root
        {...props}
        id={controlId}
        aria-labelledby={`${controlId}-label`}
        aria-describedby={
          description ? `${controlId}-description` : props["aria-describedby"]
        }
        className={cx(
          "selection-control group state-layer grid size-12 place-items-center rounded-full disabled:cursor-not-allowed",
          focusRing,
        )}
      >
        <span
          className={cx(
            "check-mark grid place-items-center",
            shape === "round"
              ? "size-6 rounded-full"
              : "size-4.5 rounded-[2px]",
          )}
        >
          <CheckboxPrimitive.Indicator forceMount className="check-indicator">
            <Icon
              name="check"
              size={18}
              className="group-data-[state=indeterminate]:hidden"
            />
            <Icon
              name="remove"
              size={18}
              className="hidden group-data-[state=indeterminate]:block"
            />
          </CheckboxPrimitive.Indicator>
        </span>
      </CheckboxPrimitive.Root>
    </SelectionRow>
  );
}
