import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { eq, getTableName, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import * as schema from "../../src/server/db/schema";
import { assertTestDatabaseUrl } from "../integration/helpers/database";
import { seedOwnedRows } from "./account-data";
import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Inspect complete rows, including JSON payloads and tables without an owner
// FK. A future table or reference column is covered without updating this query.
async function referencingRows(db: ReturnType<typeof drizzle>, userId: string) {
  return Promise.all(
    Object.values(schema).map(async (table) => {
      const name = getTableName(table);
      const owned =
        table === schema.users ||
        getTableConfig(table).foreignKeys.some(
          (fk) => fk.reference().foreignTable === schema.users,
        );
      const { rows } = await db.execute<{ row: string }>(sql`
        select to_jsonb(record)::text as row
        from ${table} as record
        where strpos(to_jsonb(record)::text, ${userId}) > 0
        order by row
      `);
      return { name, owned, rows };
    }),
  );
}

test("deletes a re-verified account and every reference without changing another account", async ({
  page,
  playwright,
  baseURL,
}) => {
  test.slow();
  const other = await playwright.request.newContext({ baseURL });
  const oldSession = await playwright.request.newContext({ baseURL });
  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  const db = drizzle({ client: pool, casing: "snake_case" });
  try {
    const userId = await signInAndConfirm(page);
    const [{ email }] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const otherEmail = `e2e-${randomUUID()}@example.test`;
    const otherResponse = await other.post("/api/test/sign-in", {
      data: { email: otherEmail, name: "Other user" },
    });
    expect(otherResponse.ok()).toBe(true);
    const { userId: otherId } = (await otherResponse.json()) as {
      userId: string;
    };
    const secondSession = await oldSession.post("/api/test/sign-in", {
      data: { email },
    });
    expect(secondSession.ok()).toBe(true);
    await seedOwnedRows(db, userId);
    await seedOwnedRows(db, otherId);
    const otherBefore = await referencingRows(db, otherId);

    let selectedIdentity = { id: otherId, email: otherEmail };
    await page.route(
      "https://github.com/login/oauth/authorize?**",
      async (route) => {
        const authorization = new URL(route.request().url());
        expect(authorization.searchParams.get("prompt")).toBe("select_account");
        const callback = new URL(
          authorization.searchParams.get("redirect_uri")!,
        );
        callback.searchParams.set(
          "state",
          authorization.searchParams.get("state")!,
        );
        callback.searchParams.set(
          "code",
          `soleup-e2e.${selectedIdentity.id}.${selectedIdentity.email}`,
        );
        await route.fulfill({
          status: 302,
          headers: { location: callback.href },
        });
      },
    );

    await page.goto("/settings");
    await page.getByRole("link", { name: "Delete account" }).click();
    const confirmation = page.getByRole("textbox", {
      name: "Type DELETE to confirm",
    });
    const verify = page.getByRole("button", { name: "Verify with GitHub" });
    const alert = page.getByRole("main").getByRole("alert");
    await expect(verify).toBeVisible();
    await expect(confirmation).toHaveCount(0);

    await verify.click();
    await expect(alert).toHaveText(
      "Verification failed. Try again with a linked account.",
    );
    await expect(confirmation).toHaveCount(0);

    selectedIdentity = { id: userId, email };
    await verify.click();
    await expect(confirmation).toBeVisible();
    await expectNoSeriousViolations(page);
    await confirmation.fill("delete");
    const remove = page.getByRole("button", {
      name: "Permanently delete account",
    });
    await remove.click();
    await expect(alert).toHaveText("Type DELETE exactly to confirm.");

    const browser = page.context();
    const proof = (await browser.cookies()).find(({ name }) =>
      name.endsWith(".deletion_proof"),
    )!;
    await browser.clearCookies({ name: proof.name });
    await confirmation.fill("DELETE");
    await remove.click();
    await expect(alert).toHaveText(
      "Verify your account again before deleting it.",
    );
    await browser.addCookies([proof]);

    const before = await referencingRows(db, userId);
    for (const [index, { name, owned, rows }] of before.entries()) {
      if (!owned) continue;
      expect(rows.length, `${name} has a deletion fixture`).toBeGreaterThan(0);
      expect(
        otherBefore[index].rows.length,
        `${name} has an independent fixture`,
      ).toBeGreaterThan(0);
    }
    expect(before.find(({ name }) => name === "sessions")?.rows).toHaveLength(
      3,
    );

    await confirmation.fill("DELETE");
    await remove.click();
    await expect(page.getByRole("status")).toHaveText(
      "Your SoleUp account was deleted.",
    );
    for (const { name, rows } of await referencingRows(db, userId)) {
      expect(rows, `no ${name} row references the deleted account`).toEqual([]);
    }
    expect(await referencingRows(db, otherId)).toEqual(otherBefore);
    expect((await oldSession.get("/api/export")).status()).toBe(401);
    expect((await page.request.get("/api/export")).status()).toBe(401);
    expect((await other.get("/api/export")).ok()).toBe(true);
  } finally {
    await Promise.all([pool.end(), other.dispose(), oldSession.dispose()]);
  }
});
