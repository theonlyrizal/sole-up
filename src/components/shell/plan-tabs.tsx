"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { Tabs } from "@/components/ui/tabs";
import { PLAN_TAB_ITEMS } from "./nav-items";

const items = PLAN_TAB_ITEMS.map((item) => ({ ...item, value: item.href }));

export function PlanTabs() {
  const pathname = usePathname();
  const wrapper = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const strip = wrapper.current?.querySelector("nav");
    const current = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !current) return;
    const viewport = strip.getBoundingClientRect();
    const link = current.getBoundingClientRect();
    if (link.left < viewport.left)
      strip.scrollLeft += link.left - viewport.left;
    if (link.right > viewport.right)
      strip.scrollLeft += link.right - viewport.right;
  }, [pathname]);

  return (
    <div ref={wrapper} className="plan-tabs min-w-0">
      <Tabs mode="link" label="Plan" items={items} value={pathname} />
    </div>
  );
}
