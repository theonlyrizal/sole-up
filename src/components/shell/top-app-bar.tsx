"use client";

import type { ReactNode } from "react";
import { useScrolled } from "@/components/hooks/use-scrolled";
import { cx } from "@/components/ui/cx";
import { IconLink } from "@/components/ui/icon-button";
import { SEARCH_PATH } from "./nav-items";

export type PageBackLink = { href: string; label: string };

export function TopAppBar({
  title,
  back,
  actions,
  greeting,
}: {
  title: string;
  back?: PageBackLink;
  actions?: ReactNode;
  greeting?: { avatar: ReactNode; date: string };
}) {
  const [scrolled, setSentinel] = useScrolled();

  return (
    <>
      <div
        ref={setSentinel}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 h-1 w-px medium:hidden"
      />
      <header
        className={cx(
          "top-app-bar sticky top-0 z-20 medium:hidden",
          scrolled && "bg-surface-container",
        )}
        data-scrolled={scrolled}
      >
        <div className="flex min-h-16 items-center gap-2 px-4">
          {back && (
            <IconLink
              href={back.href}
              label={`← ${back.label}`}
              icon="arrow_back"
              tooltip={false}
              className="-ms-2"
            />
          )}
          {greeting?.avatar}
          <div className="min-w-0 flex-1">
            <div
              className={
                greeting
                  ? "truncate text-title-medium"
                  : "truncate text-title-large"
              }
            >
              {title}
            </div>
            {greeting && (
              <div className="truncate text-body-medium text-on-surface-variant">
                {greeting.date}
              </div>
            )}
          </div>
          <div className="-me-2 flex shrink-0">
            {title !== "Search" && (
              <IconLink
                href={SEARCH_PATH}
                label="Search"
                icon="search"
                tooltip={false}
              />
            )}
            {actions}
          </div>
        </div>
      </header>
    </>
  );
}
