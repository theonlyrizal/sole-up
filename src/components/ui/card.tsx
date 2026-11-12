import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx } from "./cx";

const variants = {
  default: "rounded-2xl bg-resting-surface text-on-resting-surface shadow-card",
  hero: "rounded-3xl bg-feature-surface text-on-feature-surface",
  tonal: "rounded-2xl bg-surface-container text-on-surface",
  outlined: "rounded-2xl border border-outline-variant text-on-surface",
};

export function Card({
  as: Tag = "section",
  variant = "default",
  padding = variant === "hero" ? "l" : "m",
  headingId,
  className,
  children,
}: {
  as?: "section" | "article" | "div";
  variant?: keyof typeof variants;
  padding?: "m" | "l";
  headingId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      aria-labelledby={headingId}
      className={cx(
        "card relative min-w-0",
        variants[variant],
        padding === "l" ? "p-5 medium:p-7" : "p-4 medium:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  id,
  icon,
  actions,
  supporting,
  href,
  size = "m",
  headingLevel = 2,
}: {
  title: string;
  id?: string;
  icon?: IconName;
  actions?: ReactNode;
  supporting?: ReactNode;
  href?: string;
  size?: "m" | "l";
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
          <Icon name={icon} />
        </span>
      )}
      <div className="min-w-0 flex-1 wrap-anywhere">
        <Heading
          id={id}
          className={size === "l" ? "text-title-large" : "text-title-medium"}
        >
          {href ? (
            <Link className="stretched-link" href={href}>
              {title}
            </Link>
          ) : (
            title
          )}
        </Heading>
        {supporting}
      </div>
      {actions && <div className="relative z-10 shrink-0">{actions}</div>}
    </div>
  );
}
