import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { galleryBaseURL } from "../../playwright.config";

test("production returns 404 for the gallery", async ({ request }) => {
  test.skip(
    !process.env.CI,
    "The local suite uses Next dev. CI also serves a production build.",
  );
  expect((await request.get("/dev/ui")).status()).toBe(404);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`gallery passes axe in both themes at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${galleryBaseURL}/dev/ui`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "SoleUp component gallery",
    );
    await expect(
      page.getByRole("radiogroup", { name: "Gallery appearance" }),
    ).toHaveAttribute("tabindex", "0");
    const palettes = [];
    for (const theme of ["Light", "Dark"]) {
      const column = page.getByRole("region", { name: theme, exact: true });
      await expect(column).toBeVisible();
      await expect(column).toHaveCSS("color-scheme", theme.toLowerCase());
      palettes.push(
        await column.evaluate((section) => {
          const button = section.querySelector(".action-filled")!;
          return [
            getComputedStyle(section).backgroundColor,
            getComputedStyle(button, "::after").backgroundColor,
          ];
        }),
      );
      const { violations } = await new AxeBuilder({ page })
        .include(`section[data-theme="${theme.toLowerCase()}"]`)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map(({ target }) => target),
        })),
      ).toEqual([]);
    }
    expect(palettes[0]?.[0]).not.toBe(palettes[1]?.[0]);
    expect(palettes[0]?.[1]).not.toBe(palettes[1]?.[1]);
  });
}

test("Tab reaches every gallery tab stop and arrows reach the other group controls", async ({
  page,
}) => {
  await page.goto(`${galleryBaseURL}/dev/ui`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("radiogroup", { name: "Gallery appearance" }),
  ).toHaveAttribute("tabindex", "0");
  const tabStops = await main.evaluate((root) => {
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    );
    const candidates = controls.filter(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.matches(":disabled") &&
        element.tabIndex >= 0,
    );
    candidates.forEach((element, index) => {
      const first =
        element.querySelector<HTMLElement>(
          '[aria-checked="true"], [aria-selected="true"]',
        ) ?? element;
      first.dataset.keyboardStop = String(index);
    });
    return candidates.length;
  });
  expect(tabStops).toBeGreaterThan(70);
  let stop = 0;
  for (let press = 0; press < tabStops + 12 && stop < tabStops; press++) {
    await page.keyboard.press("Tab");
    const current = await page.evaluate(
      () => (document.activeElement as HTMLElement)?.dataset.keyboardStop,
    );
    // Native date and time inputs can contain multiple keyboard stops.
    if (current === String(stop - 1)) continue;
    expect(current).toBe(String(stop));
    stop++;
  }
  expect(stop).toBe(tabStops);

  for (const theme of ["Light", "Dark"]) {
    const column = page.getByRole("region", { name: theme, exact: true });
    const ranges = column.getByRole("radiogroup", { name: `${theme} range` });
    await ranges.getByRole("radio", { name: "Week", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      ranges.getByRole("radio", { name: "Four weeks" }),
    ).toBeFocused();
    await page.keyboard.press("Space");
    await expect(
      ranges.getByRole("radio", { name: "Four weeks" }),
    ).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(
      ranges.getByRole("radio", { name: "Twelve weeks" }),
    ).toBeFocused();

    const frequency = column.getByRole("radiogroup", {
      name: `${theme} reminder frequency`,
    });
    await frequency.getByRole("radio", { name: "Weekly" }).focus();
    await page.keyboard.down("ArrowUp");
    await expect(frequency.getByRole("radio", { name: "Daily" })).toBeChecked();
    await page.keyboard.up("ArrowUp");

    await column.getByRole("tab", { name: "Today" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      column.getByRole("tab", { name: "This week" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      column.getByRole("tabpanel", { name: "This week" }),
    ).toBeVisible();
  }
});

test("FAB uses Enter, arrows and Escape, returns focus and links mark the current page", async ({
  page,
}) => {
  await page.goto(`${galleryBaseURL}/dev/ui`);
  await expect(
    page.getByRole("radiogroup", { name: "Gallery appearance" }),
  ).toHaveAttribute("tabindex", "0");
  for (const theme of ["Light", "Dark"]) {
    const column = page.getByRole("region", { name: theme, exact: true });
    const trigger = column.getByRole("button", { name: "Create menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = column.getByRole("menu", { name: "Create menu" });
    await expect(
      menu.getByRole("menuitem", { name: "Create task" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("menuitem", { name: "Create note" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    const group = column.getByRole("navigation", {
      name: `${theme} gallery sections`,
    });
    await expect(group.getByRole("link", { name: "Actions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      group.getByRole("link", { name: "Fields" }),
    ).not.toHaveAttribute("aria-current");
  }
});

test("save feedback retains text, target dimensions, and recovery with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto(`${galleryBaseURL}/dev/ui`);
  await expect(
    page.getByText("Reduced motion is on", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCSS("color-scheme", "light");
  const form = page.getByRole("form", { name: "light save preview" });
  const title = form.getByRole("textbox", { name: "Commitment name" });
  await title.fill("Take a walk after the weekly planning session");
  const save = form.getByRole("button", { name: "Save", exact: true });
  const idleBounds = await save.boundingBox();
  await save.click();
  const pending = form.getByRole("button", { name: "Saving…" });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute("aria-busy", "true");
  const pendingBounds = await pending.boundingBox();
  expect(pendingBounds?.width).toBe(idleBounds?.width);
  expect(pendingBounds?.height).toBe(idleBounds?.height);
  await expect(pending.locator(".action-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
  await form.getByRole("button", { name: "Resolve preview" }).click();
  await expect(form.getByRole("status")).toHaveText("Preview save failed.");
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription(
    "Could not save the preview. Your text is still here.",
  );
  await expect(title).toHaveValue(
    "Take a walk after the weekly planning session",
  );
  await form.getByRole("button", { name: "Retry save" }).click();
  await form.getByRole("button", { name: "Resolve preview" }).click();
  await expect(form.getByRole("status")).toHaveText("Preview saved.");
  await form.getByRole("button", { name: "Undo" }).click();
  await expect(
    form.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
});

test("gallery fits narrow widths and 200% text with locally scrollable groups", async ({
  page,
}) => {
  await page.goto(`${galleryBaseURL}/dev/ui`);
  for (const width of [320, 375, 390, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    1280,
  );
  const longLabel = page
    .getByRole("region", { name: "Light", exact: true })
    .getByRole("textbox", { name: /^A long label/ });
  await expect(longLabel).toBeVisible();
  await longLabel.focus();
  await expect(longLabel).toBeFocused();
});
