import { describe, expect, it } from "vitest";

import { APP_ROUTE_SEGMENTS } from "@/lib/protected-paths";

import {
  NAV_ITEMS,
  NAV_SUB_ITEMS,
  PLAN_SUB_ITEMS,
  isNavItemActive,
} from "./nav-items";

describe("isNavItemActive", () => {
  it.each([
    ["/goals", "/goals"],
    ["/goals/123", "/goals"],
    ["/goals/", "/goals"],
  ])("%s is inside %s", (pathname, href) => {
    expect(isNavItemActive(pathname, href)).toBe(true);
  });

  it.each([
    ["/goalsetting", "/goals"],
    ["/home", "/goals"],
    ["/", "/home"],
  ])("%s is not inside %s", (pathname, href) => {
    expect(isNavItemActive(pathname, href)).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  it("shows exactly Home, Goals, Plan and Settings, in that order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Home",
      "Goals",
      "Plan",
      "Settings",
    ]);
  });

  it("only links to protected (app) pages", () => {
    const segments: readonly string[] = APP_ROUTE_SEGMENTS;
    for (const item of NAV_ITEMS) {
      expect(segments).toContain(item.href.slice(1));
    }
  });
});

describe("Plan sub-pages", () => {
  it("lists Today, Upcoming and Inbox under Plan", () => {
    expect(NAV_SUB_ITEMS["/plan"]).toEqual([
      { href: "/plan/today", label: "Today" },
      { href: "/plan/upcoming", label: "Upcoming" },
      { href: "/plan/inbox", label: "Inbox" },
    ]);
  });

  it("keeps every Plan sub-page inside Plan", () => {
    for (const item of PLAN_SUB_ITEMS) {
      expect(isNavItemActive(item.href, "/plan")).toBe(true);
    }
  });
});
