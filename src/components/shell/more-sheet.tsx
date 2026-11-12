"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactElement } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Icon } from "@/components/icons/icon";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ListGroup, ListItem } from "@/components/ui/list";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { MORE_ITEMS, isNavItemActive } from "./nav-items";

export type ShellAccount = { id: string; name: string };

const tints = {
  violet: "bg-area-violet-container text-area-violet-on",
  pink: "bg-area-pink-container text-area-pink-on",
  blue: "bg-area-blue-container text-area-blue-on",
  gray: "bg-area-gray-container text-area-gray-on",
};

export function MoreSheet({
  account,
  trigger,
}: {
  account: ShellAccount;
  trigger: ReactElement;
}) {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  if (openAt !== null && openAt !== pathname) setOpenAt(null);
  const active =
    MORE_ITEMS.find((item) => item.href === pathname) ??
    MORE_ITEMS.find((item) => isNavItemActive(pathname, item.href));

  return (
    <BottomSheet
      title="More"
      trigger={trigger}
      open={openAt === pathname}
      onOpenChange={(open) => setOpenAt(open ? pathname : null)}
    >
      <div className="grid gap-4">
        <ListGroup label="More destinations">
          {MORE_ITEMS.map(({ href, label, icon, tint }) => {
            const selected = active?.href === href;
            return (
              <ListItem
                key={href}
                href={href}
                headline={label}
                selected={selected}
                current={
                  selected ? (href === pathname ? "page" : "true") : undefined
                }
                onNavigate={() => setOpenAt(null)}
                leading={
                  <span
                    className={`grid size-10 place-items-center rounded-sm ${tints[tint]}`}
                  >
                    <Icon name={icon} filled={selected} />
                  </span>
                }
              />
            );
          })}
        </ListGroup>
        <ListGroup label="Account">
          <ListItem
            headline={account.name}
            leading={
              <ShapeAvatar
                id={account.id}
                entityType="user"
                label={account.name}
                size={40}
              />
            }
            trailing={<SignOutButton />}
          />
        </ListGroup>
      </div>
    </BottomSheet>
  );
}
