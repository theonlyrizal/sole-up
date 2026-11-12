import Link from "next/link";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx, focusRing } from "./cx";
import { IconButton } from "./icon-button";

type ChipAction =
  | { href: string; onClick?: never; disabled?: never }
  | {
      href?: never;
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
    };

type ChipKind =
  | { type: "assist" }
  | { type: "filter"; selected: boolean }
  | { type: "input"; onRemove: () => void }
  | { type: "status"; tone?: "neutral" | "success" | "warning" | "error" }
  | { type: "metric"; count: number };

type ChipProps = ChipAction &
  ChipKind & { label: string; icon?: IconName; className?: string };

const statusTones = {
  neutral: "bg-surface-container text-on-surface-variant",
  success: "bg-success-container text-on-success-container",
  warning: "bg-alert-container text-on-alert-container",
  error: "bg-error-container text-on-error-container",
};

export function Chip(props: ChipProps) {
  const { type, icon, label, className, href, onClick, disabled } = props;
  const interactive = Boolean(href || onClick || disabled || type === "filter");
  const selected = type === "filter" && props.selected;
  const metric = type === "metric";
  const status = type === "status";
  const chipIcon = selected ? "check" : icon;
  const content = (
    <>
      {(chipIcon || type === "filter") && (
        <span
          className="grid size-4 shrink-0 place-items-center"
          aria-hidden="true"
        >
          {chipIcon && <Icon name={chipIcon} size={18} />}
        </span>
      )}
      <span className="min-w-0 wrap-anywhere">
        {metric ? `${props.count} ${label}` : label}
      </span>
    </>
  );
  const classes = cx(
    "chip inline-flex max-w-full min-w-0 items-center justify-center gap-2 px-3",
    interactive && "ui-action state-layer min-w-12",
    interactive && focusRing,
    status ? "chip-status text-label-medium" : "text-label-large",
    status && statusTones[props.tone ?? "neutral"],
    metric ? "rounded-full tabular-nums" : "rounded-sm",
    type === "filter" && "chip-filter",
    selected && "action-tonal",
    metric && props.count > 0 && "chip-metric",
    type !== "input" &&
      !status &&
      !selected &&
      !(metric && props.count > 0) &&
      "chip-outlined",
    className,
  );
  const chip = href ? (
    <Link
      href={href}
      className={classes}
      aria-current={selected ? "page" : undefined}
    >
      {content}
    </Link>
  ) : interactive ? (
    <button
      type="button"
      className={classes}
      aria-pressed={type === "filter" ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span className={classes}>{content}</span>
  );

  if (type !== "input") return chip;
  return (
    <span className="input-chip relative isolate inline-flex max-w-full min-w-0 items-center rounded-sm">
      {chip}
      <IconButton
        label={`Remove ${label}`}
        icon="close"
        size={40}
        tooltip={false}
        disabled={disabled}
        onClick={props.onRemove}
      />
    </span>
  );
}
