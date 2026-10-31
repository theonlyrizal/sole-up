import Link from "next/link";

import { cx, focusRing } from "@/components/ui/cx";
import type { TagSummary } from "@/lib/notes/tags";

export const tagChipClass =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs break-all";

/**
 * A note's tags as chips (chunk 8.5). With `linked`, each chip opens the
 * Notes list filtered by that tag (`?tag=<id>`, never the name).
 */
export function TagChips({
  tags,
  label,
  linked = false,
}: {
  tags: TagSummary[];
  label: string;
  linked?: boolean;
}) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag.id} className="max-w-full">
          {linked ? (
            <Link
              href={`/notes?tag=${tag.id}`}
              className={cx(tagChipClass, "hover:underline", focusRing)}
            >
              {tag.name}
            </Link>
          ) : (
            <span className={tagChipClass}>{tag.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
