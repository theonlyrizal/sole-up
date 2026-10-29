import { describe, expect, it } from "vitest";

import {
  SEARCH_QUERY_EMPTY,
  SEARCH_QUERY_MAX,
  SEARCH_QUERY_TOO_LONG,
} from "@/lib/search";

import { searchSchema } from "./validation";

function messages(input: unknown): string[] {
  const parsed = searchSchema.safeParse(input);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.message);
}

describe("searchSchema", () => {
  it("trims the query", () => {
    expect(searchSchema.parse({ query: "  run  " })).toEqual({ query: "run" });
  });

  it("allows up to SEARCH_QUERY_MAX characters after trimming", () => {
    const query = "a".repeat(SEARCH_QUERY_MAX);
    expect(searchSchema.parse({ query: `  ${query}  ` })).toEqual({ query });
    expect(messages({ query: `${query}a` })).toEqual([SEARCH_QUERY_TOO_LONG]);
  });

  it("refuses an empty, blank or missing query", () => {
    expect(messages({ query: "" })).toEqual([SEARCH_QUERY_EMPTY]);
    expect(messages({ query: " \n\t " })).toEqual([SEARCH_QUERY_EMPTY]);
    expect(messages({})).toEqual([SEARCH_QUERY_EMPTY]);
    expect(messages({ query: 42 })).toEqual([SEARCH_QUERY_EMPTY]);
  });

  it("refuses unknown fields", () => {
    expect(messages({ query: "run", userId: "someone" })).not.toEqual([]);
  });
});
