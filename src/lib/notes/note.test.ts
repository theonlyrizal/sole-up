import { describe, expect, it } from "vitest";

import { linkedNotesKept } from "./note";

describe("linkedNotesKept", () => {
  it("says nothing without linked notes, and counts them otherwise", () => {
    expect(linkedNotesKept(0)).toBe("");
    expect(linkedNotesKept(1)).toBe(
      "1 linked note will be kept, only unlinked.",
    );
    expect(linkedNotesKept(3)).toBe(
      "3 linked notes will be kept, only unlinked.",
    );
  });
});
