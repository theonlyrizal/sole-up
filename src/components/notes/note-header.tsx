import type { ReactNode } from "react";

import { IconLink } from "@/components/ui/icon-button";
import { cx } from "@/components/ui/cx";

export function NoteHeader({
  archived = false,
  children,
}: {
  archived?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="note-editor-header flex min-h-16 items-center gap-2 bg-canvas max-medium:-mx-4 max-medium:px-4">
      <IconLink
        href="/notes"
        label="← Notes"
        icon="arrow_back"
        tooltip={false}
        className={cx("-ms-2", !archived && "large:hidden")}
      />
      <h1 className="min-w-0 text-title-large medium:sr-only">Note</h1>
      <div className="ms-auto flex min-w-0 items-center justify-end gap-1">
        {children}
      </div>
    </header>
  );
}
