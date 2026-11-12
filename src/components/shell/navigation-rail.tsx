"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useMediaQuery } from "@/components/hooks/use-media-query";
import { ShellSearch } from "@/components/search/shell-search";
import { cx, focusRing } from "@/components/ui/cx";
import { IconButton, IconLink } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { CreateMenu, type OpenQuickAdd } from "./create-menu";
import type { ShellAccount } from "./more-sheet";
import {
  BAR_ITEMS,
  NAV_ITEMS,
  NAV_SUB_ITEMS,
  SEARCH_PATH,
  isNavItemActive,
  type NavItem,
} from "./nav-items";
import { NavLabel } from "./navigation-bar";
import { RAIL_STORAGE_KEY } from "./rail-preference";

const railChangeEvent = "soleup:rail-change";

function subscribe(onChange: () => void) {
  window.addEventListener(railChangeEvent, onChange);
  return () => window.removeEventListener(railChangeEvent, onChange);
}

function isCollapsed() {
  return document.documentElement.dataset.rail === "collapsed";
}

function toggleRail() {
  const choice = isCollapsed() ? "expanded" : "collapsed";
  document.documentElement.dataset.rail = choice;
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, choice);
  } catch {
    // The current session still works when storage is disabled.
  }
  window.dispatchEvent(new Event(railChangeEvent));
}

const destinations = [...BAR_ITEMS, NAV_ITEMS[4], NAV_ITEMS[5]];

export function NavigationRail({
  account,
  onQuickAdd,
}: {
  account: ShellAccount;
  onQuickAdd: OpenQuickAdd;
}) {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const expanded = useMediaQuery("large") !== false && !collapsed;
  const pathname = usePathname();
  const avatar = (
    <ShapeAvatar
      id={account.id}
      label={account.name}
      entityType="user"
      size={40}
    />
  );
  return (
    <aside className="navigation-rail sticky top-0 hidden h-dvh shrink-0 flex-col medium:flex">
      <div className="rail-scroll flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-3">
        <div className="rail-heading hidden min-h-12 items-center justify-center large:flex">
          <Link
            href="/home"
            className={cx(
              "rail-expanded mr-auto flex min-h-12 items-center rounded-sm ps-4 text-title-large-emphasized",
              focusRing,
            )}
          >
            SoleUp
          </Link>
          <IconButton
            icon={collapsed ? "left_panel_open" : "left_panel_close"}
            label={
              collapsed ? "Expand navigation rail" : "Collapse navigation rail"
            }
            aria-expanded={!collapsed}
            aria-controls="rail-destinations"
            onClick={toggleRail}
          />
        </div>
        <div className="rail-create flex justify-center">
          <CreateMenu onQuickAdd={onQuickAdd} rail />
        </div>
        <div className="rail-expanded">
          <ShellSearch />
        </div>
        <div className="rail-collapsed flex justify-center">
          <IconLink
            label="Search"
            icon="search"
            href={SEARCH_PATH}
            aria-current={pathname === SEARCH_PATH ? "page" : undefined}
          />
        </div>
        <nav
          aria-label="Main"
          id="rail-destinations"
          className="flex flex-1 flex-col gap-1"
        >
          <ul className="grid gap-1">
            {destinations.map((item) => (
              <RailItem
                key={item.href}
                item={item}
                pathname={pathname}
                expanded={expanded}
              />
            ))}
          </ul>
          <ul className="mt-auto">
            <RailItem
              item={NAV_ITEMS[6]}
              pathname={pathname}
              expanded={expanded}
            />
          </ul>
        </nav>
        <div className="rail-expanded">
          <div className="flex flex-wrap items-center gap-x-2 rounded-lg bg-surface-container px-3 py-1">
            {avatar}
            <span className="min-w-0 flex-1 truncate text-label-large">
              {account.name}
            </span>
            <SignOutButton variant="icon" />
          </div>
        </div>
        <div className="rail-collapsed flex justify-center">
          <Menu modal={false}>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className={cx(
                  "state-layer grid size-12 place-items-center rounded-full",
                  focusRing,
                )}
              >
                {avatar}
              </button>
            </MenuTrigger>
            <MenuContent side="right" align="end" aria-label="Account">
              <p className="px-3 py-2 text-label-large wrap-anywhere">
                {account.name}
              </p>
              <SignOutButton variant="menu" />
            </MenuContent>
          </Menu>
        </div>
      </div>
    </aside>
  );
}

function RailItem({
  item,
  pathname,
  expanded,
}: {
  item: NavItem;
  pathname: string;
  expanded: boolean;
}) {
  const { href, label, icon } = item;
  const active = isNavItemActive(pathname, href);
  const children = active ? NAV_SUB_ITEMS[href] : undefined;
  const currentChild =
    expanded && children?.some((child) => child.href === pathname);
  return (
    <li className="min-w-0">
      <Link
        href={href}
        aria-current={
          active
            ? href === pathname && !currentChild
              ? "page"
              : "true"
            : undefined
        }
        className={cx(
          "rail-link shell-nav-item state-layer flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full py-1 text-label-medium focus-visible:-outline-offset-3",
          focusRing,
        )}
      >
        <NavLabel icon={icon} label={label} active={active} />
      </Link>
      {children && (
        <ul className="rail-expanded mb-1 grid gap-0.5">
          {children.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                aria-current={pathname === child.href ? "page" : undefined}
                className={cx(
                  "rail-child state-layer flex min-h-12 items-center rounded-full ps-13 pe-3 text-body-medium focus-visible:-outline-offset-3",
                  focusRing,
                )}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
