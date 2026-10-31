// Tag constants and types shared by the server (schema, validation,
// service) and the UI (chunk 8.5). Pure: no server-only imports.
// The rules come from docs/decisions/0016-notes-rich-text-links-search-tags.md.
//
// A tag name is user content: it never goes into an audit event or a log.

/** A tag name holds 1 to this many characters, trimmed. */
export const TAG_NAME_MAX = 40;

/** A note has at most this many tags. */
export const NOTE_TAGS_MAX = 20;

/** Shown when a tag name is empty after trimming. */
export const TAG_NAME_EMPTY = "Give the tag a name.";

/** Shown when a tag name is over TAG_NAME_MAX. */
export const TAG_NAME_TOO_LONG = `Keep a tag to ${TAG_NAME_MAX} characters.`;

/** Shown when a rename takes a name another tag has, ignoring case. */
export const TAG_NAME_TAKEN = "You already have a tag with that name.";

/** Shown when a note would get more than NOTE_TAGS_MAX tags. */
export const NOTE_TAGS_FULL = `A note can have up to ${NOTE_TAGS_MAX} tags.`;

/** A tag as notes and lists show it. */
export type TagSummary = { id: string; name: string };

/**
 * A name as it is stored: control characters removed, runs of whitespace
 * made one space, and trimmed. May be empty.
 */
export function normalizeTagName(name: string): string {
  return name
    .replace(/\s+/gu, " ")
    .replace(/\p{Cc}/gu, "")
    .trim();
}

/** The key two names share when they differ only in case. */
export function tagNameKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

/**
 * The names normalized, with repeats (ignoring case) removed, first
 * spelling kept, in order. Empty names are dropped.
 */
export function uniqueTagNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = normalizeTagName(raw);
    if (!name) continue;
    const key = tagNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/** "3 notes", "1 note", "no notes": how many notes carry a tag. */
export function tagNoteCount(count: number): string {
  if (count === 0) return "no notes";
  return count === 1 ? "1 note" : `${count} notes`;
}
