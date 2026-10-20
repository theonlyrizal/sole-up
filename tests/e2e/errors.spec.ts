import { expect, test } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

// /test-errors/* are test-only pages that fail on purpose (see
// src/app/(public)/test-errors). Their thrown message stands in for user
// content: it must never be shown.

test("an unexpected action error shows a generic message with its request ID", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/test-errors/action");

  const actionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Fail on purpose" }).click();
  const requestId = (await actionResponse).headers()["x-request-id"];

  const alert = page.locator("main").getByRole("alert");
  await expect(alert).toContainText("Something went wrong. Please try again.");
  // The ID the proxy gave the action's request, which the log line carries.
  expect(requestId).toMatch(UUID);
  await expect(alert).toContainText(`Reference: ${requestId}`);
  await expect(page.locator("main")).not.toContainText("private note");
});

test("a rendering error shows the error page with a reference", async ({
  page,
}) => {
  const response = await page.goto("/test-errors/render");
  expect(response?.headers()["x-request-id"]).toMatch(UUID);

  const main = page.locator("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "Something went wrong" }),
  ).toBeVisible();
  await expect(main).toContainText(/Reference: \S+/);
  await expect(main).not.toContainText("private note");
  await expectNoSeriousViolations(page);
});

test("the health endpoint reports the database", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-request-id"]).toMatch(UUID);
  expect(await response.json()).toEqual({ status: "ok", database: "ok" });
});
