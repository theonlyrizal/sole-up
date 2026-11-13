import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { expect, test, type Page } from "@playwright/test";

import { galleryBaseURL } from "../../playwright.config";
import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";
import {
  createUnscheduledHabit,
  DAILY_HABIT,
  EVENT_TITLE,
  GOAL_TITLE,
  QUANTITY_HABIT,
  seedVisualData,
  VISUAL_ZONE,
} from "./visual-data";

test.skip(!process.env.SOLEUP_VISUAL, "visual capture only");
test.use({ timezoneId: VISUAL_ZONE, locale: "en-US" });

const output = "test-results/visual/ui-3";
const sizes = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const themes = ["light", "dark"] as const;

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-5 Today ${viewport.width} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          const animation = animate.call(this, keyframes, options);
          if (this.classList.contains("confirmation-halo")) {
            animation.pause();
            animation.currentTime = 35;
          }
          return animation;
        };
      });
      const path = (state: string) =>
        `test-results/visual/ui-5/today-${state}-${viewport.width}-${theme}.png`;
      const capture = (state: string, fullPage = true) =>
        page.screenshot({ path: path(state), fullPage, caret: "initial" });
      const region = (name: string) =>
        page.getByRole("region", { name, exact: true });

      await signInAndConfirm(page);
      await openPage(page, "/plan/today");
      await expect(region("Planned for today")).toContainText(
        "Nothing planned for today",
      );
      await capture("empty");
      await expectNoSeriousViolations(page);

      const { userId, today } = await seedVisualData(page, {
        todaySchedule: true,
      });
      await openPage(page, "/plan/today");
      await expect(
        region("Schedule").getByText("Now", { exact: true }).first(),
      ).toBeVisible();
      await expect(region("Habits")).toContainText("6 of 12 pages");
      for (const width of [320, 375, 390, 414, 768, 1280]) {
        await page.setViewportSize({ width, height: viewport.height });
        await checkRenderedPage(page, theme);
      }
      await page.setViewportSize(viewport);
      await capture("populated");
      await expectNoSeriousViolations(page);

      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await checkRenderedPage(page, theme);
      await capture("text-200");
      await page.evaluate(() => {
        document.documentElement.style.removeProperty("font-size");
      });

      const add = page.getByRole("button", {
        name: "Add to today",
        exact: true,
      });
      await add.press("Enter");
      const picker = page.getByRole("dialog", { name: "Add to today" });
      await expect(
        picker.getByRole("group", { name: "Due soon" }),
      ).toBeVisible();
      await capture("suggestions", false);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(add).toBeFocused();

      const earlier = region("Earlier, not done");
      const taskActions = earlier.getByRole("button", {
        name: /^Actions for /,
      });
      await taskActions.press("Enter");
      await expect(
        page.getByRole("menuitem", { name: "Plan for today" }),
      ).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: "Pick a date" }),
      ).toBeFocused();
      await capture("keyboard-menu", false);
      await page.keyboard.press("Enter");
      const date = page.getByRole("dialog", { name: "Pick a date" });
      await expect(date.getByLabel("Plan for", { exact: true })).toBeFocused();
      await capture("date", false);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(taskActions).toBeFocused();

      const title = earlier.getByRole("button", {
        name: "Move the spare seedlings to the porch",
        exact: true,
      });
      await title.press("Enter");
      await expect(
        page.getByRole("dialog", { name: "Edit task" }).getByLabel("Title"),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(title).toBeFocused();
      for (const [item, role, name] of [
        ["Block time", "dialog", "Block time"],
        [
          "Delete task",
          "alertdialog",
          "Delete “Move the spare seedlings to the porch”?",
        ],
      ] as const) {
        await taskActions.click();
        await page.getByRole("menuitem", { name: item, exact: true }).click();
        await expect(page.getByRole(role, { name, exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(taskActions).toBeFocused();
      }

      if (viewport.width === 1280) {
        const addTask = page.getByRole("button", {
          name: "Add task",
          exact: true,
        });
        await addTask.press("Enter");
        await expect(
          page.getByRole("dialog", { name: "Add task" }).getByLabel("Title"),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(addTask).toBeFocused();
        const blockTime = page.getByRole("button", {
          name: "Block time",
          exact: true,
        });
        await blockTime.press("Enter");
        await expect(
          page.getByRole("dialog", { name: "Block time" }).getByLabel("Task"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(blockTime).toBeFocused();
      }

      const amountActions = region("Habits").getByRole("button", {
        name: `Actions for ${QUANTITY_HABIT}`,
      });
      await amountActions.click();
      await page.getByRole("menuitem", { name: "Change amount" }).click();
      const amount = page.getByRole("dialog", { name: "Change amount" });
      const field = amount.getByLabel("Amount today (pages)");
      await expect(field).toHaveValue("6");
      await field.fill("4.555");
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holdSave = async (route: import("@playwright/test").Route) => {
        if (route.request().method() !== "POST") return route.fallback();
        await gate;
        await route.continue();
      };
      await page.route("**/plan/today", holdSave);
      await amount.getByRole("button", { name: "Save" }).click();
      await expect(
        amount.getByRole("button", { name: "Saving…" }),
      ).toHaveAttribute("aria-disabled", "true");
      await capture("amount-pending", false);
      release();
      await expect(amount.getByRole("alert")).toBeVisible();
      await expect(field).toHaveValue("4.555");
      await capture("amount-error", false);
      await page.unroute("**/plan/today", holdSave);

      await page.emulateMedia({ reducedMotion: "no-preference" });
      await field.fill("4.5");
      await amount.getByRole("button", { name: "Save" }).click();
      await expect(amount).toHaveCount(0);
      await expect(amountActions).toBeFocused();
      const row = region("Habits")
        .getByRole("listitem")
        .filter({ hasText: QUANTITY_HABIT });
      await expect(row).toContainText("4.5 of 12 pages");
      const halo = row.locator(".confirmation-halo");
      await expect
        .poll(() => halo.evaluate((element) => element.getAnimations().length))
        .toBe(1);
      await row.screenshot({ path: path("amount-retry-saved") });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page
        .getByRole("region", { name: /^Notifications/ })
        .getByRole("button", { name: "Undo" })
        .click();
      await expect(row).toContainText("6 of 12 pages");
      await expect
        .poll(() => halo.evaluate((element) => element.getAnimations().length))
        .toBe(0);
      await row.screenshot({ path: path("amount-undone-reduced-motion") });

      const repair = await createUnscheduledHabit(userId, today, true);
      await page.goto("/plan/today");
      await expect(
        page.getByRole("heading", { name: "Today couldn't load" }),
      ).toBeVisible();
      await capture("error");
      await expectNoSeriousViolations(page);
      await repair();
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(region("Schedule")).toBeVisible();
      await capture("recovered");
    });
  }
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-4 Home ${viewport.width} ${theme}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-4/home-${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
        });
      const region = (name: string) =>
        page.getByRole("region", { name, exact: true });

      await signInAndConfirm(page, "Alex Morgan");
      await expect(region("Today")).toContainText("Nothing yet");
      const todayColor = await region("Today").evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await page.evaluate(() => document.fonts.ready.then(() => null));
      await checkRenderedPage(page, theme);
      await capture("empty");
      await expectNoSeriousViolations(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await checkRenderedPage(page, theme);
      await capture("empty-text-200");
      await page.evaluate(() => {
        document.documentElement.style.removeProperty("font-size");
      });

      const { userId, today } = await seedVisualData(page, { home: true });
      await openPage(page, "/home");
      const commitment = region("Next commitment");
      const habits = region("Your habits this week");
      const carousel = habits.getByRole("list", { name: "Active habits" });
      await expect(
        commitment.getByRole("link", { name: EVENT_TITLE }),
      ).toBeVisible();
      await expect(commitment).toHaveCSS("background-color", todayColor);
      await expect(region("Today")).not.toHaveCSS(
        "background-color",
        todayColor,
      );
      await expect(
        carousel.getByRole("img", { name: /^1 of 3 times so far this week/ }),
      ).toBeVisible();
      if (viewport.width === 390) {
        await expect(
          habits.getByRole("button", { name: "Next habits" }),
        ).toBeEnabled();
        await expect(
          commitment.getByRole("link", { name: "Open in calendar" }),
        ).toBeInViewport();
        const bounds = (await commitment.boundingBox())!;
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(402);
      } else {
        await expect(carousel).toHaveCSS("display", "grid");
        await expect(
          habits.getByRole("button", { name: "Next habits" }),
        ).toBeHidden();
      }
      await checkRenderedPage(page, theme);
      await capture("populated");
      await capture("first-screen", false);
      await expectNoSeriousViolations(page);

      const info = commitment.getByRole("button", {
        name: "How this is counted: Next commitment",
      });
      await info.focus();
      await info.press("Enter");
      const panel = page.getByRole("dialog", { name: "How this is counted" });
      await expect(panel.locator("time")).toBeVisible();
      await capture("metric-info", false);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(info).toBeFocused();

      const goals = region("Goals without a next action");
      const showAll = goals.getByRole("button", { name: "View all 4" });
      await expect(goals.getByRole("link")).toHaveCount(4); // The count and the first three rows.
      await showAll.focus();
      await showAll.press("Enter");
      await expect(showAll).toHaveAttribute("aria-expanded", "true");
      await expect(goals.getByRole("link")).toHaveCount(5);
      await capture("goals-expanded");
      await showAll.press("Enter");
      await expect(goals.getByRole("link")).toHaveCount(4);

      if (viewport.width === 390) {
        const next = habits.getByRole("button", { name: "Next habits" });
        const previous = habits.getByRole("button", {
          name: "Previous habits",
        });
        await next.focus();
        await next.press("Enter");
        await expect(previous).toBeEnabled();
        if (await next.isEnabled()) await next.press("Enter");
        await expect(next).toBeDisabled();
        await expect(next).toBeFocused();
        await capture("habits-next");
        await previous.press("Enter");
        if (await previous.isEnabled()) await previous.press("Enter");
        await expect(previous).toBeDisabled();
      }

      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await checkRenderedPage(page, theme);
      await capture("text-200");

      const repair = await createUnscheduledHabit(userId, today);
      await page.goto("/home");
      const alert = page
        .getByRole("alert")
        .filter({ hasText: "Home couldn't load" });
      await expect(alert).toContainText(/Reference: \S+/);
      await expect(alert).not.toContainText("Habit has no schedule");
      await capture("error");
      await expectNoSeriousViolations(page);

      await repair();
      const retry = alert.getByRole("button", { name: "Try again" });
      const retryRequest = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/home" &&
          request.headers().rsc === "1",
      );
      const gate = Promise.withResolvers<void>();
      const delayRetry = async (route: import("@playwright/test").Route) => {
        if (route.request().headers().rsc === "1") await gate.promise;
        await route.continue();
      };
      await page.route(/\/home(?:\?|$)/, delayRetry);
      try {
        await retry.click();
        await retryRequest;
        await expect(
          alert.getByRole("button", { name: "Trying again…" }),
        ).toBeDisabled();
        await capture("retry-pending");
      } finally {
        gate.resolve();
      }
      await expect(
        habits.getByRole("link", { name: "Water the herbs" }),
      ).toBeVisible();
      await expect(alert).toHaveCount(0);
      await page.unroute(/\/home(?:\?|$)/, delayRetry);
      await capture("retry-recovered");

      await page.route("**/_next/static/**/*.js*", (route) => route.abort());
      await openPage(page, "/home");
      const progress = carousel.getByRole("img", {
        name: /^1 of 3 times so far this week/,
      });
      await expect(progress).toBeVisible();
      await expect(progress.locator("span > span").first()).toHaveAttribute(
        "style",
        "height:100%",
      );
      await capture("first-paint");
    });
  }
}

for (const viewport of sizes) {
  test(`@visual UI-2a component gallery ${viewport.width}`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.goto(`${galleryBaseURL}/dev/ui`);
    await expect(
      page.getByRole("radiogroup", { name: "Gallery appearance" }),
    ).toHaveAttribute("tabindex", "0");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const path = (name: string) =>
      `test-results/visual/ui-2a/${name}-${viewport.width}.png`;
    await page.screenshot({ path: path("gallery-compare"), fullPage: true });

    for (const theme of themes) {
      const name = theme === "light" ? "Light" : "Dark";
      const column = page.getByRole("region", { name, exact: true });
      await column.screenshot({ path: path(`gallery-${theme}`) });
      const fab = column.getByRole("button", { name: "Create menu" });
      await fab.scrollIntoViewIfNeeded();
      await fab.focus();
      await page.keyboard.press("Enter");
      await expect(
        column.getByRole("menuitem", { name: "Create task" }),
      ).toBeFocused();
      await page.screenshot({
        path: path(`fab-open-${theme}`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(fab).toBeFocused();

      await page.emulateMedia({ reducedMotion: "reduce" });
      const form = column.getByRole("form", { name: `${theme} save preview` });
      const save = form.getByRole("button", { name: "Save", exact: true });
      await save.focus();
      await form.screenshot({ path: path(`focus-${theme}`) });
      await page.keyboard.press("Enter");
      await expect(
        form.getByRole("button", { name: "Saving…" }),
      ).toHaveAttribute("aria-busy", "true");
      await form.screenshot({
        path: path(`pending-reduced-motion-${theme}`),
        animations: "disabled",
      });
      await form.getByRole("button", { name: "Resolve preview" }).click();
      await expect(form.getByRole("status")).toHaveText("Preview save failed.");
      await form.screenshot({ path: path(`error-${theme}`) });
      await form.getByRole("button", { name: "Retry save" }).click();
      await form.getByRole("button", { name: "Resolve preview" }).click();
      await expect(form.getByRole("status")).toHaveText("Preview saved.");
      await form.screenshot({ path: path(`retry-saved-${theme}`) });
      await form.getByRole("button", { name: "Undo" }).click();
      await expect(save).toBeEnabled();
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
  });
}

async function openPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^Loading/ }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-2b ${viewport.width} ${theme}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({
        colorScheme: theme,
        reducedMotion: "no-preference",
      });
      await page.addInitScript(() => {
        // Hold the real halo near its start so screenshot timing is repeatable.
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          const animation = animate.call(this, keyframes, options);
          if (this.classList.contains("confirmation-halo")) {
            animation.pause();
            animation.currentTime = 35;
          }
          return animation;
        };
      });
      await page.goto(`${galleryBaseURL}/dev/ui`);
      await expect(
        page.getByRole("radiogroup", { name: "Gallery appearance" }),
      ).toHaveAttribute("tabindex", "0");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const column = page.getByRole("region", {
        name: theme === "light" ? "Light" : "Dark",
        exact: true,
      });
      const path = (state: string) =>
        `test-results/visual/ui-2b/${state}-${viewport.width}-${theme}.png`;
      const style = "nextjs-portal { visibility: hidden !important; }";
      const screenshot = (state: string) =>
        page.screenshot({ path: path(state), animations: "disabled", style });
      await column
        .getByRole("region", { name: "Containment and feedback" })
        .screenshot({
          path: path("gallery"),
          animations: "disabled",
          style,
        });

      const edit = column.getByRole("button", { name: "Edit workshop form" });
      await edit.focus();
      await page.keyboard.press("Enter");
      const form = page.getByRole("dialog", { name: "Edit workshop" });
      await expect(form.getByRole("button", { name: "Close" })).toBeFocused();
      await screenshot("form-dialog");
      const save = form.getByRole("button", { name: "Save workshop" });
      await save.click();
      await expect(save).toHaveAttribute("aria-busy", "true");
      await screenshot("form-pending");
      const error = form.getByRole("alert");
      await expect(error).toBeVisible();
      await error.scrollIntoViewIfNeeded();
      await screenshot("form-failure");
      await save.click();
      await expect(form).toBeHidden();
      await expect(edit).toBeFocused();

      const sheet = column.getByRole("button", { name: "Open bottom sheet" });
      await sheet.click();
      await expect(
        page.getByRole("dialog", { name: "Workshop options" }),
      ).toBeVisible();
      await screenshot("bottom-sheet");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeFocused();

      const menu = column.getByRole("button", { name: "Workshop menu" });
      await menu.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: "Archive" }),
      ).toBeFocused();
      await screenshot("menu-keyboard");
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();

      await column
        .getByRole("button", { name: "Show snackbar with action" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Outline archived." }),
      ).toBeVisible();
      await screenshot("snackbar");
      await page.getByRole("button", { name: "Dismiss" }).click();

      const owner = column.getByRole("group", { name: "Try logging water" });
      const log = owner.getByRole("button", { name: "Log 2 cups" });
      const state = owner.getByRole("status");
      const captureOwner = (name: string) =>
        owner.screenshot({ path: path(name), animations: "disabled" });
      await log.click();
      await expect(state).toHaveText("Saving 2 cups…");
      await captureOwner("confirmation-pending");
      await owner.getByRole("button", { name: "Resolve with error" }).click();
      await expect(state).toContainText("Could not save");
      await captureOwner("confirmation-failure");
      await owner.getByRole("button", { name: "Retry log" }).click();
      await owner.getByRole("button", { name: "Resolve save" }).click();
      await expect(state).toHaveText("2 of 3 cups saved.");
      await expect
        .poll(() =>
          log
            .locator(".confirmation-halo")
            .evaluate((el) => Number(getComputedStyle(el).opacity)),
        )
        .toBeGreaterThan(0);
      await owner.screenshot({ path: path("confirmation-retry"), style });
      await owner.getByRole("button", { name: "Correct to 1 cup" }).click();
      await expect(state).toHaveText("Corrected to 1 of 3 cups.");
      await captureOwner("confirmation-correction");

      await page.emulateMedia({ reducedMotion: "reduce" });
      await log.click();
      await owner.getByRole("button", { name: "Resolve save" }).click();
      await expect(state).toHaveText("2 of 3 cups saved.");
      await captureOwner("confirmation-reduced-motion");
    });
  }
}

async function checkRenderedPage(
  page: Page,
  colorScheme: (typeof themes)[number],
) {
  const styles = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      font: style.fontFamily,
      scheme: style.colorScheme,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      fontLoaded: Array.from(document.fonts).some(
        (face) =>
          /google.sans.flex/i.test(face.family) && face.status === "loaded",
      ),
    };
  });
  expect(styles.font).toMatch(/google.sans.flex/i);
  expect(styles.fontLoaded).toBe(true);
  expect(styles.scheme).toBe(colorScheme);
  expect(
    styles.overflow,
    `page overflow at ${page.viewportSize()?.width}px on ${new URL(page.url()).pathname}`,
  ).toBeLessThanOrEqual(1);
}

for (const viewport of sizes) {
  for (const colorScheme of themes) {
    test(`@visual UI-3 ${viewport.width} ${colorScheme}`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const fontOrigins = new Set<string>();
      page.on("request", (request) => {
        if (request.resourceType() === "font")
          fontOrigins.add(new URL(request.url()).origin);
      });
      const { goalId, noteId, pastReviewId, thisWeek, tomorrow } =
        await seedVisualData(page);

      const core = [
        ["home", "/home"],
        ["plan-today", "/plan/today"],
        ["track", "/track"],
        ["review", "/review"],
        ["settings", "/settings"],
      ] as const;
      const supplemental = [
        ["plan", "/plan"],
        ["plan-inbox", "/plan/inbox"],
        ["plan-upcoming", "/plan/upcoming"],
        ["calendar", "/plan/calendar"],
        ["calendar-grid", `/plan/calendar?view=day&date=${tomorrow}`],
        ["calendar-areas", `/plan/calendar?view=areas&date=${tomorrow}`],
        ["calendar-timeline", `/plan/calendar?view=timeline&date=${tomorrow}`],
        ["goals", "/goals"],
        ["goal-detail", `/goals/${goalId}`],
        ["goals-areas", "/goals/areas"],
        ["goals-archived", "/goals/archived"],
        ["track-week", "/track?range=week"],
        ["track-12w", "/track?range=12w"],
        ["track-archived", "/track/archived"],
        ["notes", "/notes"],
        ["note-detail", `/notes/${noteId}`],
        ["note-new", "/notes/new"],
        ["notes-archived", "/notes/archived"],
        ["notes-search", "/notes/search"],
        ["notes-tags", "/notes/tags"],
        ["review-reflect", "/review?step=reflect"],
        ["review-history", "/review/history"],
        ["review-detail", `/review/history/${pastReviewId}`],
        ["review-insights", "/review/insights"],
        [
          "insight-detail",
          `/review/insights/next_week_workload?start=${thisWeek}`,
        ],
        ["settings-delete-account", "/settings/delete-account"],
      ] as const;
      const capture = async (name: string, target: Page = page) => {
        await target.screenshot({
          path: `${output}/${name}-${viewport.width}-${colorScheme}.png`,
          fullPage: true,
          animations: "disabled",
          caret: "initial",
        });
      };

      for (const [name, path] of [...core, ...supplemental]) {
        await test.step(path, async () => {
          await openPage(page, path);
          if (name === "home")
            await expect(
              page.getByText(EVENT_TITLE, { exact: true }),
            ).toBeVisible();
          if (name === "track")
            await expect(
              page.getByText("1 of 3 times", { exact: false }).first(),
            ).toBeVisible();
          if (name === "goal-detail")
            await expect(
              page.getByRole("heading", { name: GOAL_TITLE, level: 1 }),
            ).toBeVisible();
          if (name === "note-detail")
            await expect(page.getByText(/^Loading (tags|links)/)).toHaveCount(
              0,
            );
          await checkRenderedPage(page, colorScheme);
          await capture(name);
          await expectNoSeriousViolations(page);
        });
      }

      // Public routes, including sign-in, need a fresh session.
      const guestContext = await page
        .context()
        .browser()!
        .newContext({ viewport, colorScheme, reducedMotion: "reduce" });
      await guestContext.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      try {
        const guest = await guestContext.newPage();
        for (const [name, path] of [
          ["landing", "/"],
          ["sign-in", "/sign-in"],
          ["privacy", "/privacy"],
          ["not-found", "/missing.html"],
        ] as const) {
          await openPage(guest, new URL(path, page.url()).href);
          await checkRenderedPage(guest, colorScheme);
          await capture(name, guest);
          await expectNoSeriousViolations(guest);
        }
      } finally {
        await guestContext.close();
      }

      await test.step("reflow at intermediate widths and 200% text size", async () => {
        if (viewport.width === 390) {
          for (const width of [320, 375, 414, 768]) {
            await page.setViewportSize({ width, height: viewport.height });
            for (const [, path] of core) {
              await openPage(page, path);
              await checkRenderedPage(page, colorScheme);
            }
          }
          await page.setViewportSize(viewport);
        } else {
          for (const [name, path] of core) {
            await openPage(page, path);
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "200%";
            });
            await expect(page.locator("body")).toHaveCSS("font-size", "32px");
            await checkRenderedPage(page, colorScheme);
            await capture(`${name}-text-200`);
          }
        }
      });

      await openPage(page, "/home");
      if (viewport.width === 390) {
        const more = page
          .getByRole("navigation", { name: "Main", exact: true })
          .getByRole("button", { name: "More", exact: true });
        await more.click();
        await expect(
          page.getByRole("dialog", { name: "More", exact: true }),
        ).toBeVisible();
        await capture("more-open");
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
      } else {
        await page
          .getByRole("button", { name: "Collapse navigation rail" })
          .click();
        await expect(page.getByRole("complementary")).toHaveCSS(
          "width",
          "96px",
        );
        await capture("home-rail-collapsed");
        await page
          .getByRole("button", { name: "Expand navigation rail" })
          .click();
      }
      const add = page.getByRole("button", { name: "Create", exact: true });
      await add.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(add).toBeFocused();
      await expect(add).toHaveCSS("outline-width", "3px");
      await expect(add).toHaveCSS("outline-offset", "2px");
      await expect(add).toHaveCSS("box-shadow", /inset/);
      await capture("home-keyboard-focus");
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("menuitem", { name: "New task" }),
      ).toBeFocused();
      await capture("home-create-menu");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Add task" });
      await expect(dialog.getByLabel("Title")).toBeFocused();
      await capture("home-quick-add");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(add).toBeFocused();
      expect([...fontOrigins]).toEqual([new URL(page.url()).origin]);

      if (viewport.width === 390) {
        await page.emulateMedia({
          colorScheme,
          reducedMotion: "reduce",
          contrast: "more",
        });
        await expect(page.locator(".app-header-wash")).toHaveCSS(
          "background-image",
          "none",
        );
        await page.emulateMedia({
          colorScheme,
          reducedMotion: "reduce",
          contrast: "no-preference",
        });

        // Hold the action in flight, then let the real server reject its title.
        // The form should retain the user's draft and accept an ordinary retry.
        const finishRequest = Promise.withResolvers<void>();
        await page.route("**/home", async (route) => {
          const request = route.request();
          if (
            request.method() !== "POST" ||
            !request.headers()["next-action"]
          ) {
            await route.continue();
            return;
          }
          const [input] = request.postDataJSON() as [Record<string, unknown>];
          await finishRequest.promise;
          await route.continue({
            postData: JSON.stringify([{ ...input, title: "" }]),
          });
        });
        await add.press("q");
        const title = dialog.getByLabel("Title");
        await title.fill("Pack an extra water bottle");
        await dialog
          .getByRole("button", { name: "Add task", exact: true })
          .click();
        try {
          await expect(
            dialog.getByRole("button", { name: "Adding…" }),
          ).toBeDisabled();
          await capture("home-quick-add-pending");
        } finally {
          finishRequest.resolve();
        }
        await expect(title).toHaveAttribute("aria-invalid", "true");
        await expect(title).toHaveValue("Pack an extra water bottle");
        await capture("home-quick-add-error");
        await page.unroute("**/home");
        await dialog
          .getByRole("button", { name: "Add task", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByText("Task added to your inbox", { exact: true }),
        ).toBeVisible();
        await capture("home-quick-add-retry-saved");

        // Exercise the existing save and correction path while motion is reduced.
        await openPage(page, "/plan/today");
        await page
          .getByRole("button", { name: `Done: ${DAILY_HABIT}` })
          .click();
        await expect(
          page.getByText("Marked done", { exact: true }),
        ).toBeVisible();
        await capture("today-habit-saved");
        await page.getByRole("button", { name: "Undo", exact: true }).click();
        await expect(page.getByText("Undone", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("button", { name: `Done: ${DAILY_HABIT}` }),
        ).toBeEnabled();

        // The saved weekly figure is already in the server-rendered page.
        await page.route("**/_next/static/**/*.js*", (route) => route.abort());
        await openPage(page, "/track?range=week");
        await expect(
          page.getByText("1 of 3 times", { exact: false }).first(),
        ).toBeVisible();
        await capture("track-first-paint");
      }
    });
  }
}
