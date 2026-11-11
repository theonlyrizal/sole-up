import { randomUUID } from "node:crypto";

import { expect, it } from "vitest";

import { entityIdentity } from "./identity";

it("uses the entity type and id as a stable identity key", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const habit = entityIdentity("habit", id);
  expect(habit).toEqual({ shape: "flower", palette: "violet" });
  expect(entityIdentity("habit", id)).toEqual(habit);
  expect(entityIdentity("goal", id)).toEqual({
    shape: "clover-8",
    palette: "violet",
  });
});

it("uses all nine shapes and six palettes across 1,000 entity ids", () => {
  const identities = Array.from({ length: 1_000 }, () =>
    entityIdentity("habit", randomUUID()),
  );
  expect(new Set(identities.map(({ shape }) => shape)).size).toBe(9);
  expect(new Set(identities.map(({ palette }) => palette)).size).toBe(6);
});
