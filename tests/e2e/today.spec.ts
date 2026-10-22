import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The Today view (chunk 2.5): the calm empty state, the "Add to today"
// picker, the four sections and their one-tap actions. The browser (and so
// the confirmed time zone) is in Tokyo, far from UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name });
}

async function openToday(page: Page) {
  await page.goto("/plan/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Planned for today" }),
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

/** Opens the picker, retrying until the page has hydrated. */
async function openAddToToday(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Add to today" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add to today" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

test("an empty day is calm, and Add to today plans suggested tasks", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openToday(page);
  await expect(
    page.getByRole("heading", { level: 3, name: "Nothing planned for today" }),
  ).toBeVisible();
  // Only Planned for today shows while the other sections are empty.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Planned for today",
  ]);

  let picker = await openAddToToday(page);
  await expect(picker.getByText("Nothing to suggest right now.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);

  await createGoal(page, "Run a 10k");
  await addTask(page, "Long run", { goal: "Run a 10k" });
  await addTask(page, "Renew passport", { dueDate: tokyoDate(1) });
  await addTask(page, "Someday idea");

  await openToday(page);
  picker = await openAddToToday(page);
  const dueSoon = picker.getByRole("group", { name: "Due soon" });
  const goal = picker.getByRole("group", { name: "Run a 10k" });
  await expect(dueSoon.getByRole("checkbox")).toHaveCount(1);
  await expect(goal.getByRole("checkbox")).toHaveCount(1);
  // Inbox tasks with no deadline aren't suggested.
  await expect(picker.getByText("Someday idea")).toHaveCount(0);
  await expectNoSeriousViolations(page);

  await dueSoon.getByLabel("Renew passport").check();
  await goal.getByLabel("Long run").check();
  await picker.getByRole("button", { name: "Add to today" }).click();
  await expect(picker).toHaveCount(0);
  await expect(
    page.getByText("2 tasks planned for today", { exact: true }),
  ).toBeVisible();

  const planned = section(page, "Planned for today");
  await expect(planned.getByRole("listitem")).toHaveCount(2);
  await expect(planned.getByText("2 tasks", { exact: true })).toBeVisible();
  await expect(planned.getByRole("link", { name: "Run a 10k" })).toBeVisible();
  await expectNoSeriousViolations(page);

  // Complete in one tap: it leaves Today.
  await planned.getByRole("checkbox", { name: "Complete: Long run" }).click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(planned.getByRole("listitem")).toHaveCount(1);

  // Move to tomorrow in one tap: the day is empty again.
  await planned
    .getByRole("button", { name: "Move to tomorrow: Renew passport" })
    .click();
  await expect(
    page.getByText("Moved to tomorrow", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Nothing planned for today" }),
  ).toBeVisible();
});

test("a plan from yesterday waits under Earlier, not done until you decide", async ({
  page,
}) => {
  await signInAndConfirm(page);
  const yesterday = tokyoDate(-1);
  await addTask(page, "Call the bank", { plannedDate: yesterday });
  await addTask(page, "Water the plants", { plannedDate: yesterday });
  await addTask(page, "Pay the rent", { dueDate: yesterday });
  await addTask(page, "Book flights", { dueDate: tokyoDate() });

  await openToday(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Planned for today",
    "Due today",
    "Needs a decision",
    "Earlier, not done",
  ]);
  const earlier = section(page, "Earlier, not done");
  const decide = section(page, "Needs a decision");
  await expect(earlier.getByRole("listitem")).toHaveCount(2);
  await expect(
    section(page, "Due today").getByText("Book flights"),
  ).toBeVisible();
  await expect(decide.getByText("Pay the rent")).toBeVisible();

  // Nothing moves by itself: still there, still planned for yesterday.
  await page.reload();
  await expect(earlier.getByRole("listitem")).toHaveCount(2);
  await expect(earlier.getByRole("list").getByText(/^Planned /)).toHaveCount(2);

  // A passed deadline isn't shown in an alarming colour.
  const headingColor = (name: string) =>
    page
      .getByRole("heading", { level: 2, name })
      .evaluate((element) => getComputedStyle(element).color);
  expect(await headingColor("Needs a decision")).toBe(
    await headingColor("Due today"),
  );
  await expectNoSeriousViolations(page);

  // Plan for today, in one tap.
  await expect(async () => {
    await earlier
      .getByRole("button", { name: "Plan for today: Call the bank" })
      .click({ timeout: 1_000 });
    await expect(
      section(page, "Planned for today").getByText("Call the bank"),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();

  // Pick a date: Escape cancels and returns focus, Save moves it off Today.
  const pick = earlier.getByRole("button", {
    name: "Pick a date: Water the plants",
  });
  await pick.click();
  const editor = page.getByRole("form", {
    name: "Plan for: Water the plants",
  });
  await expect(editor.getByLabel("Plan for")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(pick).toBeFocused();
  await pick.click();
  await editor.getByLabel("Plan for").fill(tokyoDate(3));
  await expectNoSeriousViolations(page);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(earlier).toHaveCount(0);

  // Unplan: with no goal, it goes back to the inbox.
  await section(page, "Planned for today")
    .getByRole("button", { name: "Unplan: Call the bank" })
    .click();
  await expect(
    page.getByText("Unplanned, now in your inbox", { exact: true }),
  ).toBeVisible();

  // A new due date settles the decision.
  await decide
    .getByRole("button", { name: "New due date: Pay the rent" })
    .click();
  const dueEditor = page.getByRole("form", {
    name: "New due date: Pay the rent",
  });
  await dueEditor.getByLabel("New due date").fill(tokyoDate(2));
  await dueEditor.getByRole("button", { name: "Save" }).click();
  await expect(decide).toHaveCount(0);

  await page.goto("/plan/inbox");
  await expect(
    page.getByRole("list", { name: "Inbox tasks" }).getByText("Call the bank"),
  ).toBeVisible();
});
