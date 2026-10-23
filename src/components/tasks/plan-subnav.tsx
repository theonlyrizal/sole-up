"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PLAN_SUB_ITEMS } from "@/components/shell/nav-items";
import { cx, focusRing } from "@/components/ui/cx";

/**
 * Links between the Plan pages. The sidebar also lists them from `md` up;
 * on phones the bottom bar has room for top-level pages only, so this row
 * is how Inbox and Calendar are reached there.
 */
export function PlanSubnav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Plan" className="flex border-b border-border sm:gap-1">
      {PLAN_SUB_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              // Narrower on phones, so all five fit across 375px.
              "-mb-px rounded-t-md border-b-2 px-2 py-2 text-sm font-medium whitespace-nowrap sm:px-3",
              focusRing,
              active
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
