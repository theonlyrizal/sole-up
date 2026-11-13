import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Creates a test user and sets the browser's session cookie without OAuth. */
export async function signInForTest(
  page: Page,
  name = "Alan Turing",
): Promise<string> {
  const response = await page.request.post("/api/test/sign-in", {
    data: { email: `e2e-${randomUUID()}@example.test`, name },
  });
  expect(response.status()).toBe(200);
  const { userId } = (await response.json()) as { userId: string };
  return userId;
}

/** Signs in and confirms the proposed time zone. Returns the test user ID. */
export async function signInAndConfirm(page: Page, name?: string) {
  const userId = await signInForTest(page, name);
  await page.goto("/home");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();
  return userId;
}

/** Opens Quick Add from either shell's Create menu. */
export async function openQuickAdd(page: Page) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "Add task", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Use the same row overflow menu available to pointer and keyboard users. */
export async function chooseTaskAction(
  page: Page,
  title: string,
  action: string,
) {
  const trigger = page.getByRole("button", {
    name: `Actions for ${title}`,
    exact: true,
  });
  const item = page.getByRole("menuitem", {
    name: `${action}: ${title}`,
    exact: true,
  });
  await expect(async () => {
    if (!(await item.isVisible())) await trigger.click();
    await expect(item).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await item.click();
  return trigger;
}

/** Waits for the page's service worker to be active; its scope and script. */
export async function activeServiceWorker(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      scope: registration.scope,
      scriptURL: registration.active?.scriptURL,
    };
  });
}

/** Fails on any serious or critical WCAG 2.x A/AA violation. */
export async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((node) => node.target.join(" ")),
    }));
  expect(serious).toEqual([]);
}
