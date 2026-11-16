"use client";

import Link from "next/link";

import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";

export function NotesIndexMenu() {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon="more_vert" label="Notes options" tooltip={false} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem icon="archive" asChild>
          <Link href="/notes/archived">Archived notes</Link>
        </MenuItem>
        <MenuItem icon="label" asChild>
          <Link href="/notes/tags">Tags</Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
