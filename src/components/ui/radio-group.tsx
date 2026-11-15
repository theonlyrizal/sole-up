"use client";

import { useId } from "react";
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { Icon } from "@/components/icons/icon";
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

/** The painted swatch sits inside a separate 48 px radio target. */
export function RadioSwatch({
  label,
  children,
  style,
  ...props
}: React.ComponentProps<typeof RadioPrimitive.Item> & { label: string }) {
  return (
    <RadioPrimitive.Item
      {...props}
      aria-label={label}
      title={label}
      className={cx(
        "group grid size-12 shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-not-allowed",
        focusRing,
        props.className,
      )}
    >
      <span
        aria-hidden="true"
        style={style}
        className="grid size-10 place-items-center rounded-full border border-outline group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-focus group-data-[state=checked]:ring-offset-2 group-data-[state=checked]:ring-offset-surface-container-high"
      >
        <span className="col-start-1 row-start-1 group-data-[state=checked]:invisible">
          {children}
        </span>
        <RadioPrimitive.Indicator className="col-start-1 row-start-1">
          <Icon name="check" size={20} />
        </RadioPrimitive.Indicator>
      </span>
    </RadioPrimitive.Item>
  );
}

type RowLabel = { label: string; description?: string };
type NativeRadioProps = Omit<
  React.ComponentProps<"input">,
  "type" | "children"
> & {
  native: true;
};
type RadixRadioProps = Omit<
  React.ComponentProps<typeof RadioPrimitive.Item>,
  "children"
> & {
  native?: false;
};

export function RadioRow({
  label,
  description,
  id,
  className,
  ...props
}: RowLabel & (NativeRadioProps | RadixRadioProps)) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const aria = {
    "aria-labelledby": `${controlId}-label`,
    "aria-describedby": description
      ? `${controlId}-description`
      : props["aria-describedby"],
  };
  const controlClass = cx(
    "selection-control state-layer grid size-12 place-items-center rounded-full disabled:cursor-not-allowed",
    focusRing,
  );
  let control;
  if (props.native) {
    const { native, ...input } = props;
    control = (
      <span className="selection-control grid size-12 place-items-center">
        <input
          {...input}
          {...aria}
          id={controlId}
          type={native ? "radio" : undefined}
          className={cx(
            "absolute inset-0 size-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed",
            focusRing,
          )}
        />
        <span className="radio-mark pointer-events-none grid size-5 place-items-center rounded-full">
          <span className="native-radio-indicator size-2.5 rounded-full bg-current" />
        </span>
      </span>
    );
  } else {
    const { native, ...item } = props;
    control = (
      <RadioPrimitive.Item
        {...item}
        {...aria}
        id={controlId}
        className={native ? undefined : controlClass}
      >
        <span className="radio-mark grid size-5 place-items-center rounded-full">
          <RadioPrimitive.Indicator className="size-2.5 rounded-full bg-current" />
        </span>
      </RadioPrimitive.Item>
    );
  }
  return (
    <SelectionRow
      id={controlId}
      label={label}
      description={description}
      className={className}
    >
      {control}
    </SelectionRow>
  );
}
