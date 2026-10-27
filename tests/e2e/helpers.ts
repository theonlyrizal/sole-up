import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Signs in a new user and confirms the proposed time zone. */
export async function signInAndConfirm(page: Page, name = "Alan Turing") {
  const response = await page.request.post("/api/test/sign-in", {
    data: { email: `e2e-${randomUUID()}@example.test`, name },
  });
  expect(response.status()).toBe(200);
  await page.goto("/home");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();
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
