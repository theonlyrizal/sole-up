import { Chip } from "@/components/ui/chip";
import type { TagSummary } from "@/lib/notes/tags";

/** Read-only tag names, optionally linked to the active Notes filter. */
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
    <ul
      aria-label={label}
      className="relative z-10 mt-1 flex w-fit max-w-full flex-wrap gap-1"
    >
      {tags.map((tag) => (
        <li key={tag.id} className="max-w-full">
          {linked ? (
            <Chip
              type="assist"
              label={tag.name}
              href={`/notes?tag=${tag.id}`}
            />
          ) : (
            <Chip type="status" label={tag.name} />
          )}
        </li>
      ))}
    </ul>
  );
}
