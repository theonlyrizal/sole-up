import { z } from "zod";

import {
  SEARCH_QUERY_EMPTY,
  SEARCH_QUERY_MAX,
  SEARCH_QUERY_TOO_LONG,
} from "@/lib/search";

// Input for search (chunk 8.4, ADR 0016). The terms are user content: they
// arrive only as a Server Action argument, and are never logged.

export const searchSchema = z.strictObject({
  query: z
    .string(SEARCH_QUERY_EMPTY)
    .trim()
    .min(1, SEARCH_QUERY_EMPTY)
    .max(SEARCH_QUERY_MAX, SEARCH_QUERY_TOO_LONG),
});
export type SearchInput = z.output<typeof searchSchema>;
