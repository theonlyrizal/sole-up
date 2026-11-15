import { expect, test, type Page } from "@playwright/test";

import {
  chooseGoalMenuItem,
  expectNoSeriousViolations,
  signInAndConfirm,
} from "./helpers";

async function openLifeAreas(page: Page) {
  await page.getByRole("link", { name: "Goals" }).click();
  await chooseGoalMenuItem(page, "Life areas", "Goals options");
  await expect(
    page.getByRole("heading", { level: 1, name: "Life areas" }),
  ).toBeVisible();
}

function activeNames(page: Page) {
  return page
    .getByRole("region", { name: "Active" })
    .getByRole("listitem")
    .locator("span.text-title-medium");
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

  // Create with Enter, then a duplicate rejected in place.
  const newButton = page.getByRole("button", { name: "New area", exact: true });
  const create = page.getByRole("dialog", { name: "New life area" });
  const name = create.getByRole("textbox", { name: "Name", exact: true });
  await newButton.click();
  await name.fill("Health");
  await name.press("Enter");
  await expect(create).toHaveCount(0);
  await expect(activeNames(page)).toHaveText(["Health"]);
  await newButton.click();
  await expect(name).toHaveValue("");
  await name.fill("health");
  await name.press("Enter");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveValue("health");
  await expect(page.getByText("already have an active area")).toBeVisible();
  await name.fill("Career");
  await name.press("Enter");
  await expect(create).toHaveCount(0);
  await expect(activeNames(page)).toHaveText(["Health", "Career"]);
  await expectNoSeriousViolations(page);

  // Escape cancels and returns focus to the overflow button.
  const options = await chooseGoalMenuItem(page, "Edit", "Actions for Career");
  const edit = page.getByRole("dialog", { name: "Edit life area" });
  await expect(edit.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await chooseGoalMenuItem(page, "Edit", "Actions for Career");
  await edit.getByLabel("Name").fill("Work");
  await edit.getByLabel("Description").fill("Job and side projects");
  const colors = edit.getByRole("radiogroup", { name: "Colour" });
  const noColor = colors.getByRole("radio", { name: "No colour" });
  await expect(noColor).toBeChecked();
  await noColor.focus();
  await page.keyboard.down("ArrowRight");
  try {
    await expect(colors.getByRole("radio", { name: "Gray" })).toBeChecked();
  } finally {
    await page.keyboard.up("ArrowRight");
  }
  const blue = colors.getByRole("radio", { name: "Blue" });
  await blue.click();
  await expect(blue).toBeChecked();
  await expectNoSeriousViolations(page);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
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
  await chooseGoalMenuItem(page, "Archive", "Actions for Work");
  await expect(activeNames(page)).toHaveText(["Health"]);
  const toggle = page.getByRole("button", { name: "Archived (1)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "Archived (1)" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Restore Work" }).click();
  await expect(activeNames(page)).toHaveText(["Health", "Work"]);

  // Delete needs confirmation. Escape cancels and returns focus.
  // The archived list stays open once shown.
  await chooseGoalMenuItem(page, "Archive", "Actions for Health");
  await expect(
    page.getByRole("button", { name: "Archived (1)" }),
  ).toBeVisible();
  const deleteButton = await chooseGoalMenuItem(
    page,
    "Delete…",
    "Actions for Health",
  );
  const dialog = page.getByRole("alertdialog", { name: "Delete “Health”?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(deleteButton).toBeFocused();

  await chooseGoalMenuItem(page, "Delete…", "Actions for Health");
  await dialog.getByRole("button", { name: "Delete area" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").getByText("Area deleted"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Archived \(/ })).toHaveCount(
    0,
  );
  await expect(activeNames(page)).toHaveText(["Work"]);
});
