import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import type { PageBackLink } from "./top-app-bar";

export function PageHeader({
  title,
  description,
  actions,
  subnav,
  back,
  eyebrow,
  headingLevel = 1,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  subnav?: React.ReactNode;
  back?: PageBackLink;
  eyebrow?: React.ReactNode;
  headingLevel?: 1 | 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <header className="grid min-w-0 grid-cols-1 gap-3 medium:gap-4">
      {back && (
        <div className="hidden medium:block">
          <Link
            href={back.href}
            aria-label={`← ${back.label}`}
            className={buttonClass({ variant: "text", icon: "arrow_back" })}
          >
            <Icon name="arrow_back" size={20} />
            {back.label}
          </Link>
        </div>
      )}
      <div className="flex flex-col items-start gap-3 medium:flex-row medium:flex-wrap medium:items-end medium:justify-between">
        <div className="w-full min-w-0 medium:w-auto medium:flex-1">
          {eyebrow && (
            <div className="mb-1 text-label-large text-on-surface-variant">
              {eyebrow}
            </div>
          )}
          <Heading className="sr-only text-headline-medium wrap-anywhere medium:not-sr-only large:text-headline-medium-emphasized">
            {title}
          </Heading>
          {description && (
            <p className="text-body-large text-on-surface-variant medium:max-expanded:truncate">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {subnav}
    </header>
  );
}
