import { z } from "zod";

import {
  normalizeTagName,
  NOTE_TAGS_FULL,
  NOTE_TAGS_MAX,
  TAG_NAME_EMPTY,
  TAG_NAME_MAX,
  TAG_NAME_TOO_LONG,
  uniqueTagNames,
} from "@/lib/notes/tags";

// Input for tags (chunk 8.5, ADR 0016). A tag name is user content: it is
// never logged, and no message here repeats it.

const noteIdSchema = z.uuid("Choose a note.");
const tagIdSchema = z.uuid("Choose a tag.");

/** One tag name, normalized (src/lib/notes/tags.ts), 1–TAG_NAME_MAX. */
export const tagNameSchema = z
  .string(TAG_NAME_EMPTY)
  .transform(normalizeTagName)
  .pipe(z.string().min(1, TAG_NAME_EMPTY).max(TAG_NAME_MAX, TAG_NAME_TOO_LONG));

/**
 * A note's whole set of tags by name: each normalized, repeats ignoring
 * case dropped (first spelling kept), at most NOTE_TAGS_MAX.
 */
export const setNoteTagsSchema = z.strictObject({
  id: noteIdSchema,
  names: z
    .array(tagNameSchema, TAG_NAME_EMPTY)
    // Bounded before the repeats are dropped, so a huge list costs nothing.
    .max(NOTE_TAGS_MAX * 5, NOTE_TAGS_FULL)
    .transform(uniqueTagNames)
    .refine((names) => names.length <= NOTE_TAGS_MAX, NOTE_TAGS_FULL),
});
export type SetNoteTagsInput = z.output<typeof setNoteTagsSchema>;

export const renameTagSchema = z.strictObject({
  id: tagIdSchema,
  name: tagNameSchema,
});
export type RenameTagInput = z.output<typeof renameTagSchema>;

export const tagIdInputSchema = z.strictObject({ id: tagIdSchema });
export type TagIdInput = z.output<typeof tagIdInputSchema>;

export const noteTagsQuerySchema = z.strictObject({ id: noteIdSchema });
export type NoteTagsQueryInput = z.output<typeof noteTagsQuerySchema>;
