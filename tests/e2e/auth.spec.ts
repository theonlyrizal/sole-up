import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

/** Signs in through the test-only shortcut. Never touches OAuth. */
async function signInAsNewUser(page: Page, name: string) {
  const email = `e2e-${randomUUID()}@example.test`;
  const response = await page.request.post("/api/test/sign-in", {
    data: { email, name },
  });
  expect(response.status()).toBe(200);
  return email;
}

test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in to SoleUp" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeVisible();
});

test("an OAuth error is shown as a readable message", async ({ page }) => {
  await page.goto("/sign-in?error=account_not_linked");
  await expect(page.getByRole("alert").first()).toContainText(
    "Sign in with the provider you used before",
  );

  await page.goto("/sign-in?error=something_unexpected");
  await expect(page.getByRole("alert").first()).toHaveText(
    "Sign-in didn't complete. Please try again.",
  );
});

test("the landing action follows the current session without a premature sign-in link", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/sign-in");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
  await signInAsNewUser(page, "Landing Test");
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("main a[href='/sign-in']")) {
        document.documentElement.dataset.prematureSignIn = "true";
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  const action = page.getByRole("link", { name: "Go to Home" });
  await expect(action).toHaveAttribute("href", "/home");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-premature-sign-in",
  );
  await action.click();
  await expect(page).toHaveURL(/\/home$/);

  const cookie = (await page.context().cookies()).find(({ name }) =>
    name.endsWith(".session_token"),
  )!;
  await page.context().addCookies([{ ...cookie, value: "stale" }]);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Home" })).toHaveCount(0);
});

test("sign in through the shortcut, then sign out", async ({ page }) => {
  const email = await signInAsNewUser(page, "Ada Lovelace");

  await page.goto("/home");
  // First sign-in: the time zone must be confirmed before anything else.
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();
  await expect(page.getByText("Ada Lovelace", { exact: true })).toBeVisible();
  // The session belongs to the user who signed in.
  const session = await page.request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  expect((await session.json()).user.email).toBe(email);

  // A signed-in user skips the sign-in page.
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The session is gone, not just hidden.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
});
