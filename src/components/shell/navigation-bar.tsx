"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons/icon";
import { cx, focusRing } from "@/components/ui/cx";
import { MoreSheet, type ShellAccount } from "./more-sheet";
import { BAR_ITEMS, isMoreActive, isNavItemActive } from "./nav-items";

const itemClass = cx(
  "shell-nav-item state-layer flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg py-1 text-center text-label-medium focus-visible:-outline-offset-3",
  focusRing,
);

export function NavLabel({
  icon,
  label,
  active,
}: {
  icon: IconName;
  label: string;
  active: boolean;
}) {
  return (
    <>
      <span className="shell-nav-indicator grid shrink-0 place-items-center rounded-full">
        <Icon name={icon} filled={active} />
      </span>
      <span className="shell-nav-label">{label}</span>
    </>
  );
}

export function NavigationBar({ account }: { account: ShellAccount }) {
  const pathname = usePathname();
  const moreActive = isMoreActive(pathname);
  return (
    <nav
      aria-label="Main"
      className="navigation-bar fixed inset-x-0 bottom-0 z-30 bg-surface-container shadow-2 medium:hidden"
    >
      <ul className="grid min-h-16 grid-cols-5">
        {BAR_ITEMS.map(({ href, label, icon }) => {
          const active = isNavItemActive(pathname, href);
          return (
            <li key={href} className="flex min-w-0">
              <Link
                href={href}
                className={itemClass}
                aria-current={
                  active ? (pathname === href ? "page" : "true") : undefined
                }
              >
                <NavLabel icon={icon} label={label} active={active} />
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0">
          <MoreSheet
            account={account}
            trigger={
              <button
                type="button"
                className={itemClass}
                aria-current={moreActive ? "true" : undefined}
              >
                <NavLabel icon="more_horiz" label="More" active={moreActive} />
              </button>
            }
          />
        </li>
      </ul>
    </nav>
  );
}
