import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

async function openGoals(page: Page) {
  await page.getByRole("link", { name: "Goals", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Goals" }),
  ).toBeVisible();
}

function filter(page: Page, label: string) {
  return page
    .getByRole("navigation", { name: "Filter goals by status" })
    .getByRole("link", { name: new RegExp(`^${label}`) });
}

function goalTitles(page: Page, group: string) {
  return page.getByRole("region", { name: group }).getByRole("heading", {
    level: 3,
  });
}

test("a goal can be created with only a title, in under 30 seconds", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openGoals(page);
  await expect(page.getByText("No active goals")).toBeVisible();
  await expect(filter(page, "Active")).toHaveAttribute("aria-current", "page");

  const started = Date.now();
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.type("Learn Spanish");
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveCount(0);
  await expect(goalTitles(page, "No area")).toHaveText(["Learn Spanish"]);
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(page.getByRole("status").getByText("Goal added")).toBeVisible();
  await expect(filter(page, "Active")).toHaveText("Active(1)");

  await page.reload();
  await expect(goalTitles(page, "No area")).toHaveText(["Learn Spanish"]);

  // A new goal made from another filter opens Active to show it.
  await filter(page, "Paused").click();
  await expect(page.getByText("Nothing paused")).toBeVisible();
  await page.getByRole("button", { name: "New goal" }).first().click();
  await page.keyboard.type("Call grandma weekly");
  await page.keyboard.press("Enter");
  await expect(filter(page, "Active")).toHaveAttribute("aria-current", "page");
  await expect(goalTitles(page, "No area")).toHaveText([
    "Learn Spanish",
    "Call grandma weekly",
  ]);
});

test("create with every field, and edit", async ({ page }) => {
  await signInAndConfirm(page);
  await page.goto("/goals/areas");
  await page.getByRole("button", { name: "Add selected" }).click();
  await expect(page.getByRole("button", { name: "Edit Health" })).toBeVisible();
  await openGoals(page);

  // A target before the start is a field error; the input is kept.
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill("Run a half marathon");
  await dialog
    .getByLabel("Why does this matter?")
    .fill("I want to feel strong again.");
  await dialog.getByLabel("Life area").selectOption({ label: "Health" });
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByLabel("Start date").fill("2027-05-01");
  await dialog.getByLabel("Target date").fill("2027-04-01");
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  const target = dialog.getByLabel("Target date");
  await expect(target).toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog.getByText("The target date can't be before the start date."),
  ).toBeVisible();
  await target.fill("2027-10-12");
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);

  const health = page.getByRole("region", { name: "Health" });
  await expect(goalTitles(page, "Health")).toHaveText(["Run a half marathon"]);
  await expect(health.getByText("High priority")).toBeVisible();
  await expect(health.getByText("I want to feel strong again.")).toBeVisible();
  await expect(
    health.getByText("Starts May 1, 2027 · Target Oct 12, 2027"),
  ).toBeVisible();

  // A second goal with no area is grouped after the areas.
  await page.getByRole("button", { name: "New goal" }).first().click();
  await page.keyboard.type("Read more");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 2 }).filter({ hasNotText: "No active" }),
  ).toHaveText(["Health", "No area"]);
  await expectNoSeriousViolations(page);

  // Edit: Escape cancels and returns focus; saving moves it to another area.
  const edit = page.getByRole("button", { name: "Edit: Run a half marathon" });
  await edit.click();
  const editDialog = page.getByRole("dialog", { name: "Edit goal" });
  await expect(editDialog.getByLabel("Title")).toHaveValue(
    "Run a half marathon",
  );
  await page.keyboard.press("Escape");
  await expect(editDialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await editDialog.getByLabel("Title").fill("Run a 10k");
  await editDialog.getByLabel("Life area").selectOption({ label: "Career" });
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(editDialog).toHaveCount(0);
  await expect(goalTitles(page, "Career")).toHaveText(["Run a 10k"]);
  await expect(page.getByRole("region", { name: "Health" })).toHaveCount(0);
});

test("status actions move a goal between filters", async ({ page }) => {
  await signInAndConfirm(page);
  await openGoals(page);
  await page.getByRole("button", { name: "New goal" }).first().click();
  await page.keyboard.type("Run a 10k");
  await page.keyboard.press("Enter");
  await expect(goalTitles(page, "No area")).toHaveText(["Run a 10k"]);

  // Pause → Paused; Resume → Active.
  await page.getByRole("button", { name: "Pause: Run a 10k" }).click();
  await expect(
    page.getByRole("status").getByText("Paused. Pick it up again"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "No area" })).toHaveCount(0);
  await filter(page, "Paused").click();
  await expect(filter(page, "Paused")).toHaveAttribute("aria-current", "page");
  await expect(goalTitles(page, "No area")).toHaveText(["Run a 10k"]);
  await page.getByRole("button", { name: "Resume: Run a 10k" }).click();
  await expect(page.getByText("Nothing paused")).toBeVisible();

  // Complete → Completed; Reopen → Active.
  await filter(page, "Active").click();
  await page.getByRole("button", { name: "Mark complete: Run a 10k" }).click();
  await filter(page, "Completed").click();
  await expect(goalTitles(page, "No area")).toHaveText(["Run a 10k"]);
  await page.getByRole("button", { name: "Reopen: Run a 10k" }).click();
  await expect(page.getByText("No completed goals")).toBeVisible();

  // Drop → Dropped; Reopen → Active.
  await filter(page, "Active").click();
  await page.getByRole("button", { name: "Drop: Run a 10k" }).click();
  await expect(
    page.getByRole("status").getByText("Priorities change"),
  ).toBeVisible();
  await filter(page, "Dropped").click();
  await expect(goalTitles(page, "No area")).toHaveText(["Run a 10k"]);
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Reopen: Run a 10k" }).click();
  await expect(page.getByText("Nothing dropped")).toBeVisible();

  // Archive: gone from every filter (the archive view is chunk 1.6).
  await filter(page, "Active").click();
  await page.getByRole("button", { name: "Archive: Run a 10k" }).click();
  await expect(page.getByRole("region", { name: "No area" })).toHaveCount(0);
  for (const [label, count] of [
    ["Active", 0],
    ["Paused", 0],
    ["Completed", 0],
    ["Dropped", 0],
  ] as const) {
    await expect(filter(page, label)).toHaveText(`${label}(${count})`);
  }
});
