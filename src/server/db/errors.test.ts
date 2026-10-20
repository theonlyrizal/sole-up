import { describe, expect, it } from "vitest";

import { isForeignKeyViolation, isUniqueViolation } from "./errors";

function pgError(code: string, constraint?: string) {
  return Object.assign(new Error("duplicate key"), { code, constraint });
}

describe("isUniqueViolation", () => {
  it("matches the pg error directly or as a wrapped cause", () => {
    const cause = pgError("23505", "things_name_key");
    expect(isUniqueViolation(cause, "things_name_key")).toBe(true);
    expect(
      isUniqueViolation(
        new Error("Failed query", { cause }),
        "things_name_key",
      ),
    ).toBe(true);
  });

  it("ignores other constraints, other codes and non-errors", () => {
    expect(
      isUniqueViolation(pgError("23505", "other_key"), "things_name_key"),
    ).toBe(false);
    expect(
      isUniqueViolation(pgError("23514", "things_name_key"), "things_name_key"),
    ).toBe(false);
    expect(isUniqueViolation("23505", "things_name_key")).toBe(false);
    expect(isUniqueViolation(undefined, "things_name_key")).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("matches only a foreign key violation on the named constraint", () => {
    const cause = pgError("23503", "things_parent_fk");
    expect(
      isForeignKeyViolation(
        new Error("Failed query", { cause }),
        "things_parent_fk",
      ),
    ).toBe(true);
    expect(
      isForeignKeyViolation(pgError("23503", "other_fk"), "things_parent_fk"),
    ).toBe(false);
    expect(
      isForeignKeyViolation(
        pgError("23505", "things_parent_fk"),
        "things_parent_fk",
      ),
    ).toBe(false);
  });
});
