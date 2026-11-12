/** Destinations in the main navigation. Only list pages that exist. */
export const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/goals", label: "Goals", icon: "flag" },
  { href: "/plan", label: "Plan", icon: "checklist" },
  { href: "/track", label: "Track", icon: "cycle" },
  { href: "/notes", label: "Notes", icon: "sticky_note_2" },
  { href: "/review", label: "Review", icon: "rate_review" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
const [home, goals, plan, track, notes, review, settings] = NAV_ITEMS;

export const SEARCH_PATH = "/notes/search";
export const BAR_ITEMS = [home, plan, goals, track] as const;
export const MORE_ITEMS = [
  { ...notes, tint: "violet" },
  { ...review, tint: "pink" },
  { href: SEARCH_PATH, label: "Search", icon: "search", tint: "blue" },
  { ...settings, tint: "gray" },
] as const;

/**
 * Pages inside Plan. The expanded rail and Plan tabs use the same routes.
 */
export const PLAN_SUB_ITEMS = [
  { href: "/plan", label: "All tasks", icon: "checklist" },
  { href: "/plan/today", label: "Today", icon: "today" },
  { href: "/plan/upcoming", label: "Upcoming", icon: "date_range" },
  { href: "/plan/calendar", label: "Calendar", icon: "calendar_month" },
  { href: "/plan/inbox", label: "Inbox", icon: "inbox" },
] as const;
const [allTasks, today, upcoming, calendar, inbox] = PLAN_SUB_ITEMS;
export const PLAN_TAB_ITEMS = [today, upcoming, calendar, inbox, allTasks];

/** Sub-pages listed under a main destination in the sidebar. */
export const NAV_SUB_ITEMS: Partial<
  Record<NavItem["href"], readonly { href: string; label: string }[]>
> = {
  "/plan": PLAN_TAB_ITEMS,
  "/review": [{ href: "/review/insights", label: "Insights" }],
};

/** True when `pathname` is the destination itself or a page inside it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreActive(pathname: string): boolean {
  return MORE_ITEMS.some((item) => isNavItemActive(pathname, item.href));
}
