import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APP_ROUTE_SEGMENTS, isAppPath } from "./protected-paths";

describe("isAppPath", () => {
  it.each(["/home", "/home/", "/home/settings"])("protects %s", (path) => {
    expect(isAppPath(path)).toBe(true);
  });

  it.each(["/", "/sign-in", "/homework", "/api/auth/session", "/hom"])(
    "leaves %s public",
    (path) => {
      expect(isAppPath(path)).toBe(false);
    },
  );
});

describe("APP_ROUTE_SEGMENTS", () => {
  it("lists every route folder in the (app) group", () => {
    const appDir = fileURLToPath(new URL("../app/(app)", import.meta.url));
    const routeFolders = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Private (_x), group ((x)) and parallel (@x) folders add no URL segment.
      .filter((entry) => !/^[_(@]/.test(entry.name))
      .map((entry) => entry.name);

    expect([...APP_ROUTE_SEGMENTS].sort()).toEqual(routeFolders.sort());
  });
});
