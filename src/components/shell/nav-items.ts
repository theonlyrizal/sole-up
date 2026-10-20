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
export type NavIcon = NavItem["icon"];

/** True when `pathname` is the destination itself or a page inside it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
