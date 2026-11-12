"use client";

import { useId } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { Icon } from "@/components/icons/icon";
import { cx, focusRing } from "./cx";
import { SelectionRow } from "./selection-row";

type SwitchControlProps = Omit<
  React.ComponentProps<typeof SwitchPrimitive.Root>,
  "children"
>;

function SwitchControl({ className, ...props }: SwitchControlProps) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={cx(
        "group state-layer grid h-12 w-13 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed",
        focusRing,
        className,
      )}
    >
      <span className="switch-track relative h-8 w-13 rounded-full">
        <SwitchPrimitive.Thumb className="switch-thumb grid place-items-center rounded-full">
          <Icon
            name="check"
            size={18}
            className="invisible group-data-[state=checked]:visible"
          />
        </SwitchPrimitive.Thumb>
      </span>
    </SwitchPrimitive.Root>
  );
}

type SwitchProps = SwitchControlProps & { label: string; description?: string };

export function Switch({
  label,
  id,
  className,
  description,
  ...props
}: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <SelectionRow
      id={controlId}
      label={label}
      description={description}
      className={cx("w-fit", className)}
    >
      <SwitchControl
        {...props}
        id={controlId}
        className="selection-control"
        aria-labelledby={`${controlId}-label`}
        aria-describedby={
          description ? `${controlId}-description` : props["aria-describedby"]
        }
      />
    </SelectionRow>
  );
}

export function SwitchRow({ className, ...props }: SwitchProps) {
  return <Switch {...props} className={cx("w-full", className)} />;
}
