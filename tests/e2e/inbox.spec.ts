import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

function inboxList(page: Page) {
  return page.getByRole("list", { name: "Inbox tasks" });
}

/** Captures a task the quickest way: Q, type the title, Enter. */
async function captureWithKeyboard(page: Page, title: string) {
  const dialog = page.getByRole("dialog", { name: "Add task" });
  // The shortcut listener attaches once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("q");
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
}

async function createGoal(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);
}

test("a task is captured with one field and Enter, and lands in the inbox", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/plan/inbox");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inbox" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your inbox is clear" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  await captureWithKeyboard(page, "Book the dentist");

  await expect(
    page.getByText("Task added to your inbox", { exact: true }),
  ).toBeVisible();
  await expect(
    inboxList(page).getByRole("checkbox", { name: "Book the dentist" }),
  ).toBeVisible();

  // It's stored, not just shown.
  await page.reload();
  await expect(
    inboxList(page).getByRole("checkbox", { name: "Book the dentist" }),
  ).toBeVisible();

  // Q typed into a field is just a letter.
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByLabel("Title").fill("quiet");
  await expect(dialog.getByLabel("Title")).toHaveValue("quiet");
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("quick add from any page can file a task under a goal with a plan", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoal(page, "Run a 10k");

  // The button works on any page; "More options" holds the optional fields.
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByLabel("Title").fill("Buy running shoes");
  await dialog.getByRole("button", { name: "More options" }).click();
  const parent = dialog.getByLabel("Goal or milestone");
  await expect(parent).toBeEnabled();
  await parent.selectOption({ label: "Run a 10k" });
  await dialog.getByLabel("Plan for").fill("2026-11-02");
  await dialog.getByLabel("Due").fill("2026-11-05");
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Task added", { exact: true })).toBeVisible();

  // Filed, so not in the inbox.
  await page.goto("/plan/inbox");
  await expect(
    page.getByRole("heading", { name: "Your inbox is clear" }),
  ).toBeVisible();
});

test("inbox tasks can be planned for today or assigned to a goal in bulk", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoal(page, "Learn Spanish");
  await page.goto("/plan/inbox");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inbox" }),
  ).toBeVisible();
  for (const title of ["Call the bank", "Renew passport", "Buy a phrasebook"]) {
    await captureWithKeyboard(page, title);
    await expect(
      inboxList(page).getByRole("checkbox", { name: title }),
    ).toBeVisible();
  }

  const actions = page.getByRole("group", { name: "Selected tasks" });
  const planToday = actions.getByRole("button", { name: "Plan for today" });
  await expect(planToday).toBeDisabled();

  await inboxList(page)
    .getByRole("checkbox", { name: "Call the bank" })
    .click();
  await inboxList(page)
    .getByRole("checkbox", { name: "Renew passport" })
    .click();
  await expect(actions.getByText("2 selected")).toBeVisible();
  await expectNoSeriousViolations(page);
  await planToday.click();

  await expect(
    page.getByText("2 tasks planned for today", { exact: true }),
  ).toBeVisible();
  await expect(inboxList(page).getByRole("checkbox")).toHaveCount(1);
  await expect(
    inboxList(page).getByRole("checkbox", { name: "Buy a phrasebook" }),
  ).toBeVisible();

  await actions.getByLabel("Select all").click();
  await actions
    .getByLabel("Goal or milestone")
    .selectOption({ label: "Learn Spanish" });
  await actions.getByRole("button", { name: "Assign to goal" }).click();

  await expect(
    page.getByText("1 task assigned", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your inbox is clear" }),
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("Inbox is reached from the Plan page", async ({ page }) => {
    await signInAndConfirm(page);
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Plan" })
      .tap();
    await page
      .getByRole("navigation", { name: "Plan" })
      .getByRole("link", { name: "Inbox" })
      .tap();
    await expect(
      page.getByRole("heading", { level: 1, name: "Inbox" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
