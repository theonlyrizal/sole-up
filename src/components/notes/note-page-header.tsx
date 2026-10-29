import Link from "next/link";

import { cx, focusRing } from "@/components/ui/cx";

/** The back link and heading above the editor and the read-only view. */
export function NotePageHeader() {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/notes"
        className={cx(
          "self-start rounded-sm text-sm text-muted hover:text-fg",
          focusRing,
        )}
      >
        ← Notes
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Note</h1>
    </div>
  );
}
