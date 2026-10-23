import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Home's summaries (chunk 3.2): each card shows its definition and range,
// says "Nothing yet" with no data, and every number links to the list it
// counts. The browser (and so the confirmed time zone) is in Tokyo.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

function card(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

async function openHome(page: Page) {
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();
}

async function createGoal(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);
}

/** Quick add with optional goal, planned date and due date. */
async function addTask(
  page: Page,
  title: string,
  options: { goal?: string; plannedDate?: string; dueDate?: string } = {},
) {
  const dialog = page.getByRole("dialog", { name: "Add task" });
  // The button only opens the dialog once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add task" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  if (Object.keys(options).length > 0) {
    await dialog.getByRole("button", { name: "More options" }).click();
    if (options.goal) {
      const parent = dialog.getByLabel("Goal or milestone");
      await expect(parent).toBeEnabled();
      await parent.selectOption({ label: options.goal });
    }
    if (options.plannedDate) {
      await dialog.getByLabel("Plan for").fill(options.plannedDate);
    }
    if (options.dueDate) await dialog.getByLabel("Due").fill(options.dueDate);
  }
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toHaveCount(0);
}

test("a new user's Home says nothing yet, with each card's definition and range", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openHome(page);

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Today",
    "Goals without a next action",
    "Deadlines in the next 7 days",
  ]);
  for (const name of [
    "Today",
    "Goals without a next action",
    "Deadlines in the next 7 days",
  ]) {
    const region = card(page, name);
    await expect(
      region.getByText("Nothing yet", { exact: true }),
    ).toBeVisible();
    await expect(region.getByText("Range:")).toBeVisible();
    await expect(region.getByText("As of:")).toBeVisible();
  }
  await expect(card(page, "Today")).toContainText(
    "Open tasks planned for today",
  );
  await expect(card(page, "Today")).toContainText(/Range:\s*Today, /);
  await expect(card(page, "Goals without a next action")).toContainText(
    "Range:Any date",
  );
  await expect(card(page, "Deadlines in the next 7 days")).toContainText(
    /Range:.+ to .+/,
  );

  // No zeros, percentages or overall score while there's nothing to count.
  const main = page.getByRole("main");
  await expect(main).not.toContainText("%");
  await expect(main).not.toContainText(/score/i);
  await expect(main.getByText(/^0$/)).toHaveCount(0);
  await expectNoSeriousViolations(page);

  await card(page, "Goals without a next action")
    .getByRole("link", { name: "Add a goal" })
    .click();
  await expect(page).toHaveURL(/\/goals$/);
});

test("every Home number links to the list it counts", async ({ page }) => {
  // About 15 s alone; it creates two goals and six tasks through the UI.
  test.slow();
  await signInAndConfirm(page);
  await createGoal(page, "Run a 10k");
  await createGoal(page, "Learn Spanish");
  await addTask(page, "Book a lesson", {
    goal: "Learn Spanish",
    dueDate: tokyoDate(3),
  });
  await addTask(page, "Stretch", { plannedDate: tokyoDate() });
  await addTask(page, "Book flights", { dueDate: tokyoDate() });
  await addTask(page, "Pay the rent", { dueDate: tokyoDate(-1) });
  await addTask(page, "Renew passport", { dueDate: tokyoDate(10) });

  await openHome(page);
  const today = card(page, "Today");
  const planned = today.getByRole("link", { name: "1 Planned for today" });
  await expect(planned).toHaveAttribute("href", "/plan/today#today-planned");
  await expect(
    today.getByRole("link", { name: "1 Due today" }),
  ).toHaveAttribute("href", "/plan/today#today-due");
  await expect(
    today.getByRole("link", { name: "1 Needs a decision" }),
  ).toHaveAttribute("href", "/plan/today#today-decide");

  const goals = card(page, "Goals without a next action");
  await expect(goals.getByRole("link", { name: "1 goal" })).toHaveAttribute(
    "href",
    "#goals-without-next-action",
  );
  const goalList = goals.getByRole("list", {
    name: "Goals without a next action",
  });
  await expect(goalList.getByRole("link")).toHaveText(["Run a 10k"]);

  const deadlines = card(page, "Deadlines in the next 7 days");
  await expect(
    deadlines.getByRole("link", { name: "1 deadline" }),
  ).toHaveAttribute("href", "/plan?due=next7");
  await expect(page.getByRole("main")).not.toContainText("%");
  await expectNoSeriousViolations(page);

  // Each link lands on the list it counted.
  await planned.click();
  await expect(page).toHaveURL(/\/plan\/today#today-planned$/);
  await expect(
    page
      .getByRole("region", { name: "Planned for today" })
      .getByText("Stretch"),
  ).toBeVisible();

  await openHome(page);
  await card(page, "Deadlines in the next 7 days")
    .getByRole("link", { name: "1 deadline" })
    .click();
  await expect(page).toHaveURL(/\/plan\?due=next7$/);
  const planList = page.getByRole("main");
  await expect(planList.getByText("Book a lesson")).toBeVisible();
  await expect(planList.getByText("Renew passport")).toHaveCount(0);
  await expect(planList.getByText("Book flights")).toHaveCount(0);

  await openHome(page);
  await card(page, "Goals without a next action")
    .getByRole("link", { name: "Run a 10k" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Run a 10k" }),
  ).toBeVisible();

  // Giving the goal a dated task takes it off the card.
  await addTask(page, "First run", {
    goal: "Run a 10k",
    plannedDate: tokyoDate(2),
  });
  await openHome(page);
  const updated = card(page, "Goals without a next action");
  await expect(updated.getByRole("link", { name: "0 goals" })).toBeVisible();
  await expect(
    updated.getByText("Every active goal has a next action."),
  ).toBeVisible();
});
