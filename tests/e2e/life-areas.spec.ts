import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

async function openLifeAreas(page: Page) {
  await page.getByRole("link", { name: "Goals" }).click();
  await page.getByRole("link", { name: "Life areas" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Life areas" }),
  ).toBeVisible();
}

function activeNames(page: Page) {
  return page
    .getByRole("region", { name: "Active" })
    .getByRole("listitem")
    .locator("span.font-medium");
}

test("starter areas are offered once and add only what was chosen", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openLifeAreas(page);

  const offer = page.getByRole("region", {
    name: "Start with some suggestions?",
  });
  await expect(offer).toBeVisible();
  await expectNoSeriousViolations(page);

  await offer.getByLabel("Home").uncheck();
  await offer.getByLabel("Finance").uncheck();
  await offer.getByRole("button", { name: "Add selected" }).click();

  await expect(activeNames(page)).toHaveText([
    "Learning",
    "Career",
    "Health",
    "Relationships",
  ]);
  await expect(offer).toHaveCount(0);

  await page.reload();
  await expect(activeNames(page)).toHaveCount(4);
  await expect(
    page.getByRole("region", { name: "Start with some suggestions?" }),
  ).toHaveCount(0);
});

test("create, edit, reorder, archive, restore and delete", async ({ page }) => {
  await signInAndConfirm(page);
  await openLifeAreas(page);

  // Declining the offer leaves the empty state.
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByText("No life areas yet")).toBeVisible();

  // Inline create, with Enter, and a duplicate rejected in place.
  const newArea = page.getByLabel("New area");
  await newArea.fill("Health");
  await newArea.press("Enter");
  await expect(activeNames(page)).toHaveText(["Health"]);
  await expect(newArea).toHaveValue("");
  await newArea.fill("health");
  await newArea.press("Enter");
  await expect(newArea).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("already have an active area")).toBeVisible();
  await newArea.fill("Career");
  await newArea.press("Enter");
  await expect(activeNames(page)).toHaveText(["Health", "Career"]);
  await expectNoSeriousViolations(page);

  // Inline edit; Escape cancels and returns focus to Edit.
  await page.getByRole("button", { name: "Edit Career" }).click();
  await expect(page.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Edit Career" })).toBeFocused();
  await page.getByRole("button", { name: "Edit Career" }).click();
  await page.getByLabel("Name").fill("Work");
  await page.getByLabel("Description").fill("Job and side projects");
  await page.getByLabel("Color").selectOption("blue");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(activeNames(page)).toHaveText(["Health", "Work"]);
  await expect(page.getByText("Job and side projects")).toBeVisible();

  // Reorder from the keyboard. At the top, focus moves to "down".
  await page.getByRole("button", { name: "Move Work up" }).focus();
  await page.keyboard.press("Enter");
  await expect(activeNames(page)).toHaveText(["Work", "Health"]);
  await expect(
    page.getByRole("button", { name: "Move Work down" }),
  ).toBeFocused();
  await page.reload();
  await expect(activeNames(page)).toHaveText(["Work", "Health"]);

  // Archive, then restore to the end of the list.
  await page.getByRole("button", { name: "Archive Work" }).click();
  await expect(activeNames(page)).toHaveText(["Health"]);
  const toggle = page.getByRole("button", { name: "Show archived (1)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "Hide archived (1)" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Restore Work" }).click();
  await expect(activeNames(page)).toHaveText(["Health", "Work"]);

  // Delete needs confirmation. Escape cancels and returns focus.
  // The archived list stays open once shown.
  await page.getByRole("button", { name: "Archive Health" }).click();
  await expect(
    page.getByRole("button", { name: "Hide archived (1)" }),
  ).toBeVisible();
  const deleteButton = page.getByRole("button", { name: "Delete Health" });
  await deleteButton.click();
  const dialog = page.getByRole("alertdialog", { name: "Delete “Health”?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  await dialog.getByRole("button", { name: "Delete area" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").getByText("Area deleted"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /archived/ })).toHaveCount(0);
  await expect(activeNames(page)).toHaveText(["Work"]);
});
