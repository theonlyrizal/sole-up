import { createHash } from "node:crypto";

import { expect, it, vi } from "vitest";

import { SHAPES } from "./shapes";

it.each(Object.entries(SHAPES))(
  "%s has 120 morph points inside the viewBox",
  (_name, path) => {
    expect(path).toMatch(
      /^M (?:\d+\.\d{2} ){2}(?:L (?:\d+\.\d{2} ){2}){119}Z$/,
    );
    const coordinates = path.match(/\d+\.\d{2}/g)!.map(Number);
    expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coordinates)).toBeLessThanOrEqual(100);
  },
);

it("generates the same path data on every load", async () => {
  vi.resetModules();
  const { SHAPES: fresh } = await import("./shapes");
  expect(fresh).toEqual(SHAPES);
  // Snapshot the rounded output without storing each coordinate a second time.
  expect(createHash("sha256").update(JSON.stringify(fresh)).digest("hex")).toBe(
    "5e3d23988a64296fc0a75c786cd8bccb18c7fe58aa679f5161d9ccb0a8811119",
  );
});
