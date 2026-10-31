import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { TagSummary } from "@/lib/notes/tags";

/**
 * The Notes list's tag filter (chunk 8.5): a plain GET form, so it works
 * before the page's script loads. The URL carries the tag's ID only
 * (`?tag=<id>`), never its name.
 */
export function TagFilter({
  tags,
  selected,
}: {
  tags: TagSummary[];
  selected: string | null;
}) {
  if (tags.length === 0) return null;
  return (
    <form
      method="get"
      action="/notes"
      role="search"
      aria-label="Filter notes by tag"
      className="flex flex-wrap items-end gap-2"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="notes-tag-filter" className="text-sm font-medium">
          Tag
        </label>
        <Select
          id="notes-tag-filter"
          name="tag"
          defaultValue={selected ?? ""}
          className="max-w-xs"
        >
          <option value="">All notes</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
      </div>
      <button type="submit" className={buttonClass({ variant: "secondary" })}>
        Show
      </button>
    </form>
  );
}
