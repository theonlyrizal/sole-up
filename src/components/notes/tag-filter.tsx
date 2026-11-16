import { Chip } from "@/components/ui/chip";
import type { TagSummary } from "@/lib/notes/tags";

/** The URL carries only the tag's ID (chunk 8.5). */
export function TagFilter({
  tags,
  selected,
}: {
  tags: TagSummary[];
  selected: string | null;
}) {
  if (tags.length === 0) return null;
  return (
    <nav
      aria-label="Filter notes by tag"
      className="flex min-w-0 gap-2 overflow-x-auto p-1"
    >
      <Chip
        type="filter"
        label="All notes"
        selected={!selected}
        href="/notes"
        className="shrink-0"
      />
      {tags.map((tag) => (
        <Chip
          key={tag.id}
          type="filter"
          label={tag.name}
          selected={tag.id === selected}
          href={`/notes?tag=${tag.id}`}
          className="shrink-0"
        />
      ))}
    </nav>
  );
}
