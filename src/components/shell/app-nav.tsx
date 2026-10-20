"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx, focusRing } from "@/components/ui/cx";

import { NAV_ITEMS, isNavItemActive, type NavIcon } from "./nav-items";

/**
 * The main navigation. One element for every screen size: a bar fixed to
 * the bottom on phones, a vertical list in the sidebar from `md` up. The
 * current page is marked with `aria-current="page"`.
 */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:bg-transparent md:pb-0"
    >
      <ul className="grid grid-cols-4 md:flex md:flex-col md:gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-1 flex-col items-center gap-1 px-1 py-2 text-xs font-medium md:flex-row md:gap-3 md:rounded-md md:px-3 md:text-sm",
                  focusRing,
                  "focus-visible:-outline-offset-2 md:focus-visible:outline-offset-2",
                  active
                    ? "text-accent md:bg-surface-muted md:text-fg"
                    : "text-muted hover:text-fg md:hover:bg-surface-muted",
                )}
              >
                <NavIconSvg icon={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const iconPaths: Record<NavIcon, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </>
  ),
  goals: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" />
    </>
  ),
  plan: (
    <>
      <path d="m4 6.5 1.5 1.5L8 5.5" />
      <path d="m4 12.5 1.5 1.5L8 11.5" />
      <path d="M11 7h9M11 13h9M11 19h9" />
      <circle cx="6" cy="19" r="1.25" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
};

function NavIconSvg({ icon }: { icon: NavIcon }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6 shrink-0 md:size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[icon]}
    </svg>
  );
}
