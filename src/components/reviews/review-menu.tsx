"use client";

import Link from "next/link";
import { useRef } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";

export function ReviewMenu() {
  const history = useRef<HTMLAnchorElement>(null);
  const insights = useRef<HTMLAnchorElement>(null);
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon="more_vert" label="Review options" tooltip={false} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon="history" onSelect={() => history.current?.click()}>
          Past reviews
        </MenuItem>
        <MenuItem icon="rate_review" onSelect={() => insights.current?.click()}>
          Insights
        </MenuItem>
      </MenuContent>
      {/* Use links so the review can save a draft before following them. */}
      <Link href="/review/history" ref={history} hidden>
        Past reviews
      </Link>
      <Link href="/review/insights" ref={insights} hidden>
        Insights
      </Link>
    </Menu>
  );
}
