import { describe, expect, it } from "vitest";

import {
  HIGHLIGHT_START as S,
  HIGHLIGHT_STOP as E,
  splitHighlights,
  withoutHighlights,
} from "./search";

describe("splitHighlights", () => {
  it("splits ts_headline output into plain and highlighted runs", () => {
    expect(splitHighlights(`Went ${S}running${E} at ${S}dawn${E}`)).toEqual([
      { text: "Went ", highlighted: false },
      { text: "running", highlighted: true },
      { text: " at ", highlighted: false },
      { text: "dawn", highlighted: true },
    ]);
  });

  it("returns nothing for empty text, and one plain run without delimiters", () => {
    expect(splitHighlights("")).toEqual([]);
    expect(splitHighlights("Plain")).toEqual([
      { text: "Plain", highlighted: false },
    ]);
  });

  it("joins neighbouring runs of the same kind and drops empty ones", () => {
    expect(splitHighlights(`${S}run${E}${S}ning${E}${S}${E}!`)).toEqual([
      { text: "running", highlighted: true },
      { text: "!", highlighted: false },
    ]);
  });

  it("drops stray delimiters rather than showing them", () => {
    expect(splitHighlights(`a${E}b`)).toEqual([
      { text: "ab", highlighted: false },
    ]);
    expect(splitHighlights(`a${S}b`)).toEqual([
      { text: "a", highlighted: false },
      { text: "b", highlighted: true },
    ]);
  });

  it("keeps markup as plain text", () => {
    expect(splitHighlights(`<b>${S}Script${E}</b> <img onerror=x>`)).toEqual([
      { text: "<b>", highlighted: false },
      { text: "Script", highlighted: true },
      { text: "</b> <img onerror=x>", highlighted: false },
    ]);
  });

  it("keeps characters outside the Basic Multilingual Plane whole", () => {
    expect(splitHighlights(`🏃 ${S}run${E}`)).toEqual([
      { text: "🏃 ", highlighted: false },
      { text: "run", highlighted: true },
    ]);
  });
});

describe("withoutHighlights", () => {
  it("removes the delimiters", () => {
    expect(withoutHighlights(`${S}Running${E} club`)).toBe("Running club");
  });
});
