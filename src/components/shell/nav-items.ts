/**
 * Destinations in the main navigation. Only list pages that exist; add the
 * others (Track, Notes, Review) as their phases land.
 */
export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/goals", label: "Goals", icon: "goals" },
  { href: "/plan", label: "Plan", icon: "plan" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/**
 * Pages inside Plan. The sidebar lists them under Plan; on phones the Plan
 * pages show them as their own row (PlanSubnav).
 */
export const PLAN_SUB_ITEMS = [
  { href: "/plan", label: "All tasks" },
  { href: "/plan/today", label: "Today" },
  { href: "/plan/upcoming", label: "Upcoming" },
  { href: "/plan/inbox", label: "Inbox" },
] as const;

/** Sub-pages listed under a main destination in the sidebar. */
export const NAV_SUB_ITEMS: Partial<
  Record<NavItem["href"], readonly { href: string; label: string }[]>
> = {
  "/plan": PLAN_SUB_ITEMS.filter((item) => item.href !== "/plan"),
};
export type NavIcon = NavItem["icon"];

/** True when `pathname` is the destination itself or a page inside it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
