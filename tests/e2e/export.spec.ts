import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { eq, getTableColumns, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import * as schema from "../../src/server/db/schema";
import { assertTestDatabaseUrl } from "../integration/helpers/database";
import { seedOwnedRows } from "./account-data";
import { signInAndConfirm } from "./helpers";

const privateFields: Record<string, string[]> = {
  accounts: ["accessToken", "refreshToken", "idToken", "password"],
  sessions: ["token"],
  push_subscriptions: ["endpoint", "p256dh", "auth"],
};

test("Settings downloads every owned table with only the signed-in user's rows", async ({
  page,
  request,
}) => {
  const anonymous = await request.get("/api/export");
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["cache-control"]).toContain("no-store");

  const userId = await signInAndConfirm(page);
  const other = await request.post("/api/test/sign-in", {
    data: { email: `e2e-${randomUUID()}@example.test`, name: "Other user" },
  });
  expect(other.ok()).toBe(true);
  const { userId: otherId } = (await other.json()) as { userId: string };

  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  const db = drizzle({ client: pool, casing: "snake_case" });
  try {
    await seedOwnedRows(db, userId);
    await seedOwnedRows(db, otherId);

    await page.goto("/settings");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download export" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^soleup-export-\d{4}-\d{2}-\d{2}\.json$/,
    );
    const archive = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(archive.version).toBe(1);
    expect(new Date(archive.exportedAt).toISOString()).toBe(archive.exportedAt);

    const expectedTables: string[] = [];
    for (const table of Object.values(schema)) {
      // Closure state is internal and exists only while export is disabled.
      if (table === schema.accountClosures || table === schema.cemetery)
        continue;
      const name = getTableName(table);
      const fields = getTableColumns(table);
      const owner =
        table === schema.users
          ? schema.users.id
          : getTableConfig(table)
              .foreignKeys.map((fk) => fk.reference())
              .find((fk) => fk.foreignTable === schema.users)?.columns[0];
      if (!owner) continue;
      expectedTables.push(name);

      const key = "id" in fields ? fields.id : owner;
      const rows = await db
        .select()
        .from(table)
        .where(eq(owner, userId))
        .orderBy(key);
      const otherRows = await db
        .select({ key })
        .from(table)
        .where(eq(owner, otherId));
      expect(rows.length, `${name} has a current-user fixture`).toBeGreaterThan(
        0,
      );
      expect(
        otherRows.length,
        `${name} has a cross-user fixture`,
      ).toBeGreaterThan(0);
      const expectedRows = rows.map((row) => {
        const safe = Object.fromEntries(
          Object.entries(row).filter(
            ([field]) => !privateFields[name]?.includes(field),
          ),
        );
        if (table === schema.notes) {
          safe.markdown =
            "## Café\n\n**Read _this_**\\\n[a link](<https://example.test/a(b)>)\n\n````ts\n```\n````";
        }
        return safe;
      });
      expect(archive.tables[name], name).toEqual(
        JSON.parse(JSON.stringify(expectedRows)),
      );
    }
    expect(Object.keys(archive.tables).sort()).toEqual(expectedTables.sort());
  } finally {
    await pool.end();
  }
});
