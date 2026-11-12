import { describe, expect, it } from "vitest";

import { APP_ROUTE_SEGMENTS } from "@/lib/protected-paths";

import {
  BAR_ITEMS,
  MORE_ITEMS,
  NAV_ITEMS,
  NAV_SUB_ITEMS,
  PLAN_SUB_ITEMS,
  PLAN_TAB_ITEMS,
  isMoreActive,
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
  it("shows exactly Home, Goals, Plan, Track, Notes, Review and Settings, in that order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Home",
      "Goals",
      "Plan",
      "Track",
      "Notes",
      "Review",
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

describe("compact destinations", () => {
  it("covers every main destination in the bar or More", () => {
    const destinations = new Set<string>(
      [...BAR_ITEMS, ...MORE_ITEMS].map(({ href }) => href),
    );
    for (const { href } of NAV_ITEMS) expect(destinations.has(href)).toBe(true);
    expect(BAR_ITEMS.map(({ label }) => label)).toEqual([
      "Home",
      "Plan",
      "Goals",
      "Track",
    ]);
    expect(MORE_ITEMS.map(({ label }) => label)).toEqual([
      "Notes",
      "Review",
      "Search",
      "Settings",
    ]);
  });

  it.each([
    "/notes",
    "/notes/search",
    "/notes/new",
    "/review/history",
    "/settings/delete-account",
  ])("marks More current on %s", (pathname) => {
    expect(isMoreActive(pathname)).toBe(true);
  });

  it.each(["/home", "/plan/today", "/notes-example", "/settings-extra"])(
    "leaves More inactive on %s",
    (pathname) => {
      expect(isMoreActive(pathname)).toBe(false);
    },
  );
});

describe("Plan sub-pages", () => {
  it("lists the five Plan pages in the rail and tabs", () => {
    expect(NAV_SUB_ITEMS["/plan"]).toEqual(PLAN_TAB_ITEMS);
    expect(PLAN_TAB_ITEMS.map(({ label }) => label)).toEqual([
      "Today",
      "Upcoming",
      "Calendar",
      "Inbox",
      "All tasks",
    ]);
  });

  it("keeps every Plan sub-page inside Plan", () => {
    for (const item of PLAN_SUB_ITEMS) {
      expect(isNavItemActive(item.href, "/plan")).toBe(true);
    }
  });
});
