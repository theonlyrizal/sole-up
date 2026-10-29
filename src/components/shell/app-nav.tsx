"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx, focusRing } from "@/components/ui/cx";

import {
  NAV_ITEMS,
  NAV_SUB_ITEMS,
  isNavItemActive,
  type NavIcon,
} from "./nav-items";

/**
 * The main navigation. One element for every screen size: a bar fixed to
 * the bottom on phones, a vertical list in the sidebar from `md` up. The
 * current page is marked with `aria-current="page"`. Sub-pages (Inbox
 * under Plan) are listed beneath their parent in the sidebar only; the bar
 * on phones has room for top-level pages.
 */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:bg-transparent md:pb-0"
    >
      <ul className="grid grid-cols-7 md:flex md:flex-col md:gap-1">
        {NAV_ITEMS.map((item) => {
          const subItems = NAV_SUB_ITEMS[item.href] ?? [];
          const activeSub = subItems.find((sub) => pathname === sub.href);
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="flex md:flex-col">
              <Link
                href={item.href}
                // On a sub-page the parent is marked as the current section,
                // and the sub-page link as the current page.
                aria-current={activeSub ? "true" : active ? "page" : undefined}
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
              {subItems.length > 0 && (
                <ul className="hidden md:mt-1 md:flex md:flex-col md:gap-1">
                  {subItems.map((sub) => (
                    <li key={sub.href} className="flex">
                      <Link
                        href={sub.href}
                        aria-current={activeSub === sub ? "page" : undefined}
                        className={cx(
                          "flex-1 rounded-md py-1.5 pr-3 pl-11 text-sm",
                          focusRing,
                          activeSub === sub
                            ? "font-medium text-fg"
                            : "text-muted hover:bg-surface-muted hover:text-fg",
                        )}
                      >
                        {sub.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
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
  track: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  notes: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h7M9 16h5" />
    </>
  ),
  review: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
      <path d="M12 8v4l2.5 2.5" />
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
