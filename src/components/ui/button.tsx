import { Icon, type IconName } from "@/components/icons/icon";
import { cx, focusRing } from "./cx";
import { LoadingIndicator } from "./loading-indicator";

const variants = {
  filled: "action-filled",
  tonal: "action-tonal",
  outlined: "action-outlined",
  text: "action-text",
  elevated: "action-elevated",
  danger: "action-danger",
  "danger-text": "action-danger-text",
} as const;

const variantAliases = {
  primary: "filled",
  secondary: "outlined",
  ghost: "text",
} as const;
const sizeAliases = { sm: "xs", md: "s" } as const;
export type ButtonVariant = keyof typeof variants | keyof typeof variantAliases;
export type ButtonSize = "xs" | "s" | "m" | keyof typeof sizeAliases;

type ButtonOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  trailingIcon?: IconName;
  pending?: boolean;
  fullWidth?: boolean;
  className?: string;
};

/** Class names shared with links styled as buttons. */
export function buttonClass({
  variant = "filled",
  size = "s",
  icon,
  trailingIcon,
  pending,
  fullWidth,
  className,
}: ButtonOptions = {}) {
  const look =
    variant === "primary" || variant === "secondary" || variant === "ghost"
      ? variantAliases[variant]
      : variant;
  const scale = size === "sm" || size === "md" ? sizeAliases[size] : size;
  return cx(
    "ui-action state-layer morph-press inline-flex min-w-12 max-w-full items-center justify-center gap-2 text-center wrap-anywhere",
    focusRing,
    variants[look],
    scale === "xs" && "action-xs text-label-large",
    scale === "s" && "action-s text-label-large",
    scale === "m" && "action-m text-title-medium",
    Boolean(icon || trailingIcon) && "action-with-icon",
    pending && "action-pending",
    fullWidth && "w-full",
    className,
  );
}

export type ButtonProps = React.ComponentProps<"button"> & ButtonOptions;

export function Button({
  variant,
  size,
  icon,
  trailingIcon,
  pending,
  fullWidth,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const iconSize = size === "m" ? 24 : 20;
  const spinner = pending && (
    <LoadingIndicator decorative size={24} className="action-spinner" />
  );
  const inlineSpinner = Boolean(icon || trailingIcon);
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || props["aria-busy"]}
      className={buttonClass({
        variant,
        size,
        icon,
        trailingIcon,
        pending,
        fullWidth,
        className: cx(
          props["aria-pressed"] !== undefined && "button-toggle",
          className,
        ),
      })}
    >
      {icon && (
        <span
          className="relative inline-grid shrink-0 place-items-center"
          style={{ width: iconSize, height: iconSize }}
        >
          {spinner || <Icon name={icon} size={iconSize} />}
        </span>
      )}
      {pending && !inlineSpinner ? (
        <span className="opacity-0">{children}</span>
      ) : (
        children
      )}
      {trailingIcon && (
        <span
          className="relative inline-grid shrink-0 place-items-center"
          style={{ width: iconSize, height: iconSize }}
        >
          {(!icon && spinner) || <Icon name={trailingIcon} size={iconSize} />}
        </span>
      )}
      {!inlineSpinner && spinner}
    </button>
  );
}
