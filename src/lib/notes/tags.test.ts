import { describe, expect, it } from "vitest";

import {
  normalizeTagName,
  tagNameKey,
  tagNoteCount,
  uniqueTagNames,
} from "./tags";

describe("normalizeTagName", () => {
  it("trims, joins whitespace and drops control characters", () => {
    expect(normalizeTagName("  Deep \t\n work  ")).toBe("Deep work");
    expect(normalizeTagName("a\u0000b\u0007")).toBe("ab");
    expect(normalizeTagName("   ")).toBe("");
    expect(normalizeTagName("<b>Bold</b>")).toBe("<b>Bold</b>");
  });
});

describe("tagNameKey", () => {
  it("is the same for names differing only in case or spacing", () => {
    expect(tagNameKey(" Work ")).toBe(tagNameKey("wORK"));
    expect(tagNameKey("Deep  work")).toBe(tagNameKey("deep work"));
  });
});

describe("uniqueTagNames", () => {
  it("keeps the first spelling of each name, in order, without blanks", () => {
    expect(
      uniqueTagNames(["Work", " home", "work", "", "HOME", "Ideas"]),
    ).toEqual(["Work", "home", "Ideas"]);
  });
});

describe("tagNoteCount", () => {
  it("counts notes in words", () => {
    expect(tagNoteCount(0)).toBe("no notes");
    expect(tagNoteCount(1)).toBe("1 note");
    expect(tagNoteCount(3)).toBe("3 notes");
  });
});
