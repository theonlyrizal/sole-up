import "server-only";

import { cache } from "react";

import { listNotes } from "@/server/modules/notes/queries";
import { listTags } from "@/server/modules/tags/queries";

// Primitive arguments let the layout and the index share the same read.
export const listNotesForRequest = cache((userId: string, archived = false) =>
  listNotes(userId, { archived }),
);
export const listNoteTagsForRequest = cache(listTags);
