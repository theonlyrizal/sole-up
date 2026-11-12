import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { galleryBaseURL } from "../../playwright.config";

async function openGallery(page: Page) {
  await page.goto(`${galleryBaseURL}/dev/ui`);
  await expect(
    page.getByRole("radiogroup", { name: "Gallery appearance" }),
  ).toHaveAttribute("tabindex", "0");
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["Light", "Dark"] as const) {
    test(`form dialog layout, focus and axe at ${viewport.width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openGallery(page);
      const column = page.getByRole("region", { name: theme, exact: true });
      const trigger = column.getByRole("button", {
        name: "Edit workshop form",
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const form = page.getByRole("dialog", { name: "Edit workshop" });
      const save = form.getByRole("button", { name: "Save workshop" });
      await expect(form.getByRole("button", { name: "Close" })).toBeFocused();
      await expect(form).toHaveCSS("color-scheme", theme.toLowerCase());
      await expect(form).toHaveAttribute(
        "data-layout",
        viewport.width === 390 ? "fullscreen" : "centered",
      );
      if (viewport.width === 390) {
        await expect
          .poll(() => form.boundingBox())
          .toEqual({ x: 0, y: 0, ...viewport });
        const footer = save.locator("..");
        await expect(footer).toHaveCSS("position", "sticky");
        await expect(footer).toHaveCSS(
          "background-color",
          await form.evaluate((el) => getComputedStyle(el).backgroundColor),
        );
        const saveBounds = (await save.boundingBox())!;
        expect(saveBounds.width).toBeGreaterThanOrEqual(350);
        await form
          .getByRole("button", { name: "Delete workshop" })
          .scrollIntoViewIfNeeded();
        expect(
          await form
            .locator(".form-dialog-fields")
            .evaluate((el) => el.scrollTop),
        ).toBeGreaterThan(0);
        expect(await save.boundingBox()).toEqual(saveBounds);
      } else {
        await expect
          .poll(async () => {
            const { x, y, width, height } = (await form.boundingBox())!;
            return [
              Math.round(x + width / 2),
              Math.round(y + height / 2),
              Math.round(width),
            ];
          })
          .toEqual([640, 400, 560]);
        await expect(
          form.getByRole("button", { name: "Cancel" }),
        ).toBeVisible();
      }
      const { violations } = await new AxeBuilder({ page })
        .include(".form-dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        violations.map(({ id, nodes }) => [
          id,
          nodes.map(({ target }) => target),
        ]),
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(form).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }
}

test("the compact form keeps its draft through a failed save and can retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGallery(page);
  const column = page.getByRole("region", { name: "Light", exact: true });
  await column.getByRole("button", { name: "Edit workshop form" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit workshop" });
  const title = dialog.getByRole("textbox", { name: "Title" });
  const save = dialog.getByRole("button", { name: "Save workshop" });
  await title.fill("Introductory workshop");
  await save.click();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("alert")).toContainText(
    "Your changes are still here",
  );
  await expect(title).toHaveValue("Introductory workshop");
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(
    column.getByRole("status").filter({ hasText: "Workshop details saved" }),
  ).toBeVisible();
});

test("sheet offers Close, Escape and handle drag with focus return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGallery(page);
  const column = page.getByRole("region", { name: "Dark", exact: true });
  const trigger = column.getByRole("button", { name: "Open bottom sheet" });
  const sheet = page.getByRole("dialog", { name: "Workshop options" });
  await trigger.click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => Math.round((await sheet.boundingBox())?.y ?? 0))
    .toBeLessThan(740);
  const handle = (await sheet.locator(".sheet-handle").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 110, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("responsive sheets anchor to their trigger at medium widths and use dialogs without an anchor", async ({
  page,
}) => {
  await openGallery(page);
  const column = page.getByRole("region", { name: "Light", exact: true });
  const anchored = column.getByRole("button", { name: "Open anchored sheet" });
  const unanchored = column.getByRole("button", {
    name: "Open responsive sheet",
  });
  await anchored.click();
  await expect(
    page.getByRole("dialog", { name: "Attachment options" }),
  ).toHaveClass(/popover-panel/);
  await page.keyboard.press("Escape");
  await expect(anchored).toBeFocused();
  await unanchored.click();
  await expect(
    page.getByRole("dialog", { name: "Workshop information" }),
  ).toHaveClass(/dialog-panel/);
  await page.keyboard.press("Escape");
  await expect(unanchored).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await anchored.click();
  await expect(
    page.getByRole("dialog", { name: "Attachment options" }),
  ).toHaveClass(/bottom-sheet/);
});

test("keyboard users can navigate menus, disclosures and tooltips", async ({
  page,
}) => {
  await openGallery(page);
  const column = page.getByRole("region", { name: "Light", exact: true });
  const trigger = column.getByRole("button", { name: "Workshop menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Workshop menu" });
  await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Archive" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    column.getByRole("status").filter({ hasText: "Delete selected" }),
  ).toBeVisible();

  const disclosure = column.getByRole("button", { name: "Show history" });
  const grid = column
    .locator(".disclosure-content")
    .filter({ hasText: "You added the first task on Tuesday." });
  await grid.evaluate((el) => {
    el.addEventListener("transitionrun", (event) => {
      if (
        event instanceof TransitionEvent &&
        event.propertyName === "grid-template-rows"
      )
        el.setAttribute("data-grid-transition", "");
    });
  });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(grid).toHaveAttribute("data-grid-transition", "");
  await expect(
    column.getByText("You added the first task on Tuesday."),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");

  const hint = column.getByRole("button", { name: "About workshop time" });
  await hint.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await trigger.evaluate((el) =>
    (el as HTMLElement).focus({ preventScroll: true }),
  );
  await page.keyboard.press("Tab");
  await expect(hint).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText(
    "The local time of your next workshop",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("Escape closes the focused dialog after a snackbar arrives", async ({
  page,
}) => {
  await openGallery(page);
  const column = page.getByRole("region", { name: "Light", exact: true });
  const trigger = column.getByRole("button", {
    name: "Open dialog",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Workshop details" });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  // Model a background action settling while the dialog has focus.
  await page
    .locator('section[data-theme="light"]')
    .getByRole("button", { name: "Show information", includeHidden: true })
    .dispatchEvent("click");
  await expect(page.locator(".snackbar")).toHaveText(
    "Workshop starts at 14:30.",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("segmented rows get the correct corner positions and independent link and menu targets", async ({
  page,
}) => {
  await openGallery(page);
  const column = page.getByRole("region", { name: "Light", exact: true });
  const group = column.getByRole("list", { name: "Workshop tasks" });
  await group.getByRole("button", { name: "Pack materials" }).click();
  const corners = (el: Element) => {
    const css = getComputedStyle(el);
    return [css.borderTopLeftRadius, css.borderBottomLeftRadius];
  };
  const items = group.getByRole("listitem");
  await expect(items.first()).toHaveCSS("display", "flex");
  await expect
    .poll(() => items.nth(0).evaluate(corners))
    .toEqual(["16px", "4px"]);
  await expect
    .poll(() => items.nth(1).evaluate(corners))
    .toEqual(["4px", "4px"]);
  await expect
    .poll(() => items.nth(2).evaluate(corners))
    .toEqual(["9999px", "9999px"]);
  await group.getByRole("button", { name: "Write an outline" }).click();
  await expect
    .poll(() => items.nth(2).evaluate(corners))
    .toEqual(["4px", "16px"]);
  await expect
    .poll(() =>
      column
        .getByRole("list", { name: "One task" })
        .getByRole("listitem")
        .evaluate(corners),
    )
    .toEqual(["16px", "16px"]);
  await group.getByRole("checkbox").click();
  await expect(group.getByRole("checkbox")).toBeChecked();
  await group
    .getByRole("button", { name: "Actions for Read the brief" })
    .click();
  await expect(
    page.getByRole("menu", { name: "Actions for Read the brief" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await items.first().click({ position: { x: 3, y: 22 } });
  await expect(page).toHaveURL(/#light-page-frame$/);
});

test("confirm stays open through pending and failure, then closes after retry", async ({
  page,
}) => {
  await openGallery(page);
  const column = page.getByRole("region", { name: "Light", exact: true });
  const trigger = column.getByRole("button", { name: "Delete preview" });
  await trigger.click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete the workshop?",
  });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete workshop" }).click();
  await expect(
    confirm.getByRole("button", { name: "Working…" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(confirm.getByRole("alert")).toContainText("Try again");
  await confirm.getByRole("button", { name: "Delete workshop" }).click();
  await expect(confirm).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("snackbars announce in the Radix live region and expose Undo and Dismiss", async ({
  page,
}) => {
  await openGallery(page);
  const column = page.getByRole("region", { name: "Dark", exact: true });
  const notifications = page.getByRole("region", {
    name: "Notifications (F8)",
  });
  await column
    .getByRole("button", { name: "Show snackbar with action" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Outline archived." }),
  ).toHaveAttribute("aria-live", "polite");
  await expect(notifications).toHaveCSS("color-scheme", "dark");
  await page.keyboard.press("F8");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const undo = notifications.getByRole("button", { name: "Undo" });
  await expect(undo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Outline restored." }),
  ).toBeVisible();
  await column
    .getByRole("button", { name: "Show snackbar with action" })
    .click();
  await notifications.getByRole("button", { name: "Dismiss" }).click();
  await expect(notifications.getByText("Outline archived.")).toBeHidden();
  await column.getByRole("button", { name: "Show error snackbar" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Could not refresh the preview." }),
  ).toHaveAttribute("aria-live", "assertive");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`confirmation tracks real results with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        const animation = animate.call(this, keyframes, options);
        if (this.classList.contains("confirmation-halo")) {
          const seen = Number(
            document.documentElement.dataset.confirmationPlays ?? 0,
          );
          document.documentElement.dataset.confirmationPlays = String(seen + 1);
          this.setAttribute(
            "data-test-duration",
            String(animation.effect?.getTiming().duration),
          );
          // Keep the animation active to verify that correction interrupts it.
          animation.pause();
          animation.currentTime = 35;
        }
        return animation;
      };
    });
    await openGallery(page);
    const plays = () =>
      page.evaluate(() =>
        Number(document.documentElement.dataset.confirmationPlays ?? 0),
      );
    const expected = reducedMotion === "reduce" ? 0 : 1;
    const column = page.getByRole("region", { name: "Dark", exact: true });
    const region = column.getByRole("region", { name: "Action confirmation" });
    const owner = region.getByRole("group", { name: "Try logging water" });
    const log = owner.getByRole("button", { name: "Log 2 cups" });
    const halo = log.locator(".confirmation-halo");
    const status = owner.getByRole("status");
    const bounds = (await log.boundingBox())!;
    await expect(
      region.getByText("3 of 3 cups saved", { exact: true }),
    ).toBeVisible();
    expect(await plays()).toBe(0);
    await log.click();
    await expect(log).toHaveAttribute("aria-busy", "true");
    await expect(log).toHaveAttribute("aria-disabled", "true");
    await expect(status).toHaveText("Saving 2 cups…");
    await expect(log.locator(".loading-indicator rect")).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "loading-pulse" : "loading-morph",
    );
    expect(await plays()).toBe(0);
    await owner.getByRole("button", { name: "Resolve with error" }).click();
    await expect(status).toHaveText(
      "Could not save 2 cups. Retry is available.",
    );
    expect(await plays()).toBe(0);
    await owner.getByRole("button", { name: "Retry log" }).click();
    await expect(status).toHaveText("Retrying 2 cups…");
    await owner.getByRole("button", { name: "Resolve save" }).click();
    await expect(status).toHaveText("2 of 3 cups saved.");
    expect(await plays()).toBe(expected);
    if (expected) {
      await expect(halo).toHaveAttribute("data-test-duration", "600");
      await expect
        .poll(() => halo.evaluate((el) => Number(getComputedStyle(el).opacity)))
        .toBeGreaterThan(0);
    }
    const saved = (await log.boundingBox())!;
    expect([saved.width, saved.height]).toEqual([bounds.width, bounds.height]);
    await log.click();
    await owner.getByRole("button", { name: "Resolve save" }).click();
    await expect(status).toHaveText("2 of 3 cups already saved.");
    expect(await plays()).toBe(expected);
    await owner.getByRole("button", { name: "Correct to 1 cup" }).click();
    await expect(status).toHaveText("Corrected to 1 of 3 cups.");
    expect(await plays()).toBe(expected);
    await log.click();
    await owner.getByRole("button", { name: "Resolve save" }).click();
    await expect(status).toHaveText("2 of 3 cups saved.");
    expect(await plays()).toBe(expected * 2);
    await owner.getByRole("button", { name: "Correct to 1 cup" }).click();
    await expect(status).toHaveText("Corrected to 1 of 3 cups.");
    expect(await halo.evaluate((el) => el.getAnimations().length)).toBe(0);
    expect(await plays()).toBe(expected * 2);
  });
}
