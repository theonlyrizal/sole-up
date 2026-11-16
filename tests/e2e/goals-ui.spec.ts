import { expect, test } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import {
  chooseGoalMenuItem,
  expectNoSeriousViolations,
  holdMilestoneSave,
  signInAndConfirm,
} from "./helpers";
import { GOAL_TITLE, seedVisualData } from "./visual-data";

test("inactive end tabs keep the same inner corner as the middle tabs", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAndConfirm(page);
  await page.goto("/goals?status=completed");
  const statuses = page.getByRole("navigation", {
    name: "Filter goals by status",
  });
  await expect(
    statuses.getByRole("link", { name: /^Completed/ }),
  ).toHaveAttribute("aria-current", "page");
  const corners = await statuses.getByRole("link").evaluateAll((items) =>
    items.map((item) => {
      const style = getComputedStyle(item, "::after");
      return {
        height: Number.parseFloat(style.height),
        left: Number.parseFloat(style.borderTopLeftRadius),
        right: Number.parseFloat(style.borderTopRightRadius),
      };
    }),
  );
  const [first, middle, selected, last] = corners;
  expect(middle!.left).toBeGreaterThan(0);
  expect(selected!.left).toBe(selected!.height / 2);
  expect(selected!.right).toBe(selected!.height / 2);
  expect(first).toEqual({
    height: first!.height,
    left: first!.height / 2,
    right: middle!.right,
  });
  expect(last).toEqual({
    height: last!.height,
    left: middle!.left,
    right: last!.height / 2,
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`populated goal routes pass axe at ${viewport.width} in ${theme}`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const { goalId } = await seedVisualData(page, { goalsUI: true });
      for (const [route, heading, ready] of [
        ["/goals", "Goals", "1 of 3 milestones"],
        [`/goals/${goalId}`, GOAL_TITLE, "Why this matters"],
        ["/goals/areas", "Life areas", "Neighborhood projects"],
        [
          "/goals/archived",
          "Archived goals",
          "Organize the winter walking group",
        ],
      ] as const) {
        await page.goto(route);
        await expect(
          page.getByRole("heading", { name: heading, level: 1 }),
        ).toBeVisible();
        await expect(page.getByText(ready, { exact: true })).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() => getComputedStyle(document.body).colorScheme),
          )
          .toBe(theme);
        await expectNoSeriousViolations(page);
      }

      await page.goto("/goals/areas");
      await chooseGoalMenuItem(page, "Edit", "Actions for Health");
      const picker = page.getByRole("radiogroup", { name: "Colour" });
      await expect(picker.getByRole("radio", { name: "Teal" })).toBeChecked();
      await expectNoSeriousViolations(page);
    });
  }
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`the milestone arc responds only to saved changes with ${reducedMotion}`, async ({
    page,
  }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion });
    const { goalId } = await seedVisualData(page);
    await page.addInitScript(() => {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          document.documentElement.dataset.segmentAnimations ??= "0";
        },
        { once: true },
      );
      document.addEventListener("animationstart", (event) => {
        if (event.animationName !== "milestone-segment-confirmed") return;
        const root = document.documentElement;
        root.dataset.segmentAnimations = String(
          Number(root.dataset.segmentAnimations) + 1,
        );
      });
    });
    const path = `/goals/${goalId}`;
    const count = (label: string) =>
      page.getByRole("img", { name: `${label} milestones completed` });
    const checkbox = page.getByRole("checkbox", {
      name: "Try the riverside path",
      exact: true,
    });
    const root = page.locator("html");
    await page.goto(path);
    await expect(count("1 of 3")).toBeVisible();
    await expect(root).toHaveAttribute("data-segment-animations", "0");
    await expect(page.locator("[data-milestone-motion]")).toHaveCount(0);

    const hold = await holdMilestoneSave(page, path);
    await checkbox.press("Space");
    try {
      await hold.requested;
      await expect(checkbox).toHaveAttribute("aria-busy", "true");
      await expect(checkbox).not.toBeChecked();
      await expect(count("1 of 3")).toBeVisible();
      await expect(page.locator("[data-milestone-motion]")).toHaveCount(0);
    } finally {
      hold.release();
    }
    await expect(
      page.getByRole("region", { name: "Milestones" }).getByRole("alert"),
    ).toBeVisible();
    await expect(count("1 of 3")).toBeVisible();
    await expect(checkbox).toBeFocused();
    await expect(root).toHaveAttribute("data-segment-animations", "0");
    await hold.stop();

    await checkbox.press("Space");
    await expect(count("2 of 3")).toBeVisible();
    await expect(checkbox).toBeChecked();
    await expect(root).toHaveAttribute(
      "data-segment-animations",
      reducedMotion === "reduce" ? "0" : "1",
    );
    await checkbox.press("Space");
    await expect(count("1 of 3")).toBeVisible();
    await expect(root).toHaveAttribute(
      "data-segment-animations",
      reducedMotion === "reduce" ? "0" : "2",
    );

    await page.reload();
    await expect(count("1 of 3")).toBeVisible();
    await expect(page.locator("[data-milestone-motion]")).toHaveCount(0);
  });
}
