import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import journal from "../../src/server/db/migrations/meta/_journal.json";
import { assertTestDatabaseUrl } from "./helpers/database";

describe("test database", () => {
  it("is the migrated test database", async () => {
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    expect(rows[0]?.name).toMatch(/_test$/);

    const applied = await db.execute(
      sql`SELECT hash FROM drizzle.__drizzle_migrations`,
    );
    expect(applied.rows).toHaveLength(journal.entries.length);
  });
});

// The two tests below run in order: the second proves that the setup file
// emptied the table the first one wrote to.
describe("truncation between tests", () => {
  beforeAll(async () => {
    await db.execute(
      sql`CREATE TABLE harness_probe (id integer GENERATED ALWAYS AS IDENTITY, label text)`,
    );
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE IF EXISTS harness_probe`);
  });

  it("writes a row", async () => {
    await db.execute(sql`INSERT INTO harness_probe (label) VALUES ('first')`);
    const { rows } = await db.execute(sql`SELECT * FROM harness_probe`);
    expect(rows).toHaveLength(1);
  });

  it("starts the next test with empty tables and reset identities", async () => {
    const before = await db.execute(sql`SELECT * FROM harness_probe`);
    expect(before.rows).toHaveLength(0);

    const { rows } = await db.execute<{ id: number }>(
      sql`INSERT INTO harness_probe (label) VALUES ('second') RETURNING id`,
    );
    expect(rows[0]?.id).toBe(1);
  });
});

describe("assertTestDatabaseUrl", () => {
  it("accepts a local database whose name ends in _test", () => {
    const url = "postgres://u:p@localhost:5432/soleup_test";
    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it.each([
    ["missing", undefined, /not set/],
    ["empty", "", /not set/],
    ["not a URL", "soleup_test", /not a valid URL/],
    ["the dev database", "postgres://u:p@localhost:5432/soleup_dev", /_test/],
    ["a remote host", "postgres://u:p@db.example.com:5432/app_test", /local/],
  ])("rejects %s", (_case, url, message) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow(message);
  });
});
