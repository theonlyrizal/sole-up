import type { ReactNode } from "react";
import { Icon } from "@/components/icons/icon";
import { cx } from "./cx";

const tones = {
  info: {
    look: "bg-secondary-container text-on-secondary-container",
    icon: "info",
  },
  warning: {
    look: "bg-alert-container text-on-alert-container",
    icon: "warning",
  },
  error: { look: "bg-error-container text-on-error-container", icon: "error" },
  success: {
    look: "bg-success-container text-on-success-container",
    icon: "check_circle",
  },
} as const;

type BannerProps = {
  tone?: keyof typeof tones;
  role?: "status" | "alert";
  title?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function InlineBanner(props: BannerProps) {
  const {
    tone = "info",
    role = tone === "error" || tone === "warning" ? "alert" : "status",
    title,
    action,
    children,
  } = props;
  const { look, icon } = tones[tone];
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-lg p-4 wrap-anywhere",
        look,
      )}
    >
      <div role={role} className="flex min-w-0 grow basis-48 items-start gap-3">
        <Icon name={icon} size={20} className="shrink-0" />
        <div className="min-w-0 text-body-medium">
          {(title || tone === "warning") && (
            <div className="text-title-small">{title ?? "Warning"}</div>
          )}
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
