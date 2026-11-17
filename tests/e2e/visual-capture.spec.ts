import { reviewHref } from "../../src/lib/review-flow";
import { REVIEW_TEXT_MAX } from "../../src/lib/weekly-reviews";
import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { expect, test, type Page } from "@playwright/test";

import { galleryBaseURL } from "../../playwright.config";
import {
  auditThemes as themes,
  desktop,
  phone,
  seedAuditRoutes,
} from "./audit-routes";
import {
  chooseGoalMenuItem,
  expectNoSeriousViolations,
  holdMilestoneSave,
  openQuickAdd,
  openRenderedPage as openPage,
  signInAndConfirm,
} from "./helpers";
import { seedInsightEvidence } from "./insight-evidence";
import {
  CALENDAR_BLOCK_TITLE,
  CALENDAR_SERIES_TITLE,
  createUnscheduledHabit,
  DAILY_HABIT,
  EVENT_TITLE,
  GOAL_TITLE,
  INBOX_TASK,
  QUANTITY_HABIT,
  seedVisualData,
  seedVisualDevice,
  UPCOMING_TASK,
  VISUAL_ZONE,
} from "./visual-data";

test.skip(!process.env.SOLEUP_VISUAL, "visual capture only");
test.use({ timezoneId: VISUAL_ZONE, locale: "en-US" });

const output = "test-results/visual/ui-3";
const sizes = [phone, desktop] as const;

const auditSizes = [
  { width: 360, height: 800 },
  phone,
  { width: 768, height: 1024 },
  { width: 1024, height: 800 },
  desktop,
  { width: 1600, height: 1000 },
] as const;

for (const viewport of auditSizes) {
  for (const theme of themes) {
    test(`@visual UI-13 route sweep ${viewport.width} ${theme}`, async ({
      page,
      browser,
      baseURL,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      let homeHabitIdentity:
        { shape: string | null; color: string } | undefined;

      async function captureRoutes(
        target: Page,
        routes: ReadonlyArray<readonly [string, string]>,
      ) {
        for (const [name, path] of routes) {
          await test.step(name, async () => {
            await openPage(target, path);
            if (name === "note-detail" || name === "note-new") {
              await expect(
                target.getByText(/^Loading (tags|links)/),
              ).toHaveCount(0);
              await expect(
                target.getByRole("textbox", { name: "Note", exact: true }),
              ).toBeEditable();
            }
            if (name === "landing" || name === "landing-signed-in") {
              const action = target.getByRole("link", {
                name: name === "landing" ? "Sign in" : "Go to Home",
                exact: true,
              });
              await expect(action).toBeVisible();
              const lines = await action.evaluate((element) => {
                const text = document.createRange();
                text.selectNodeContents(element);
                return new Set(
                  Array.from(text.getClientRects(), (rect) => rect.top),
                ).size;
              });
              expect(lines, "the main action should fit on one line").toBe(1);
            }
            if (name === "home" || name === "today" || name === "track") {
              const habit = target
                .getByRole(name === "today" ? "listitem" : "article")
                .filter({
                  has: target.getByText(DAILY_HABIT, { exact: true }),
                });
              const identity = await habit
                .locator('svg[viewBox="0 0 100 100"] path')
                .evaluate((mark) => ({
                  shape: mark.getAttribute("d"),
                  color: getComputedStyle(mark).fill,
                }));
              if (name === "home") homeHabitIdentity = identity;
              else expect(identity).toEqual(homeHabitIdentity);
            }
            await target.screenshot({
              path: `test-results/visual/ui-13/${name}-${viewport.width}-${theme}.png`,
              fullPage: true,
              animations: "disabled",
            });
            await checkRenderedPage(target, theme);
          });
        }
      }

      await captureRoutes(page, [
        ...(await seedAuditRoutes(page)),
        ["landing-signed-in", "/"],
        ["calendar-day", "/plan/calendar?view=day"],
        ["calendar-week", "/plan/calendar?view=week"],
        ["calendar-areas", "/plan/calendar?view=areas"],
        ["calendar-timeline", "/plan/calendar?view=timeline"],
        ["track-week", "/track?range=week"],
        ["track-4w", "/track?range=4w"],
        ["track-12w", "/track?range=12w"],
        ["review-reflect", "/review?step=reflect"],
        ["review-adjust", "/review?step=adjust"],
        ["review-priorities", "/review?step=priorities"],
        ["goal-not-found", "/goals/missing"],
        ["note-not-found", "/notes/missing"],
        ["review-not-found", "/review/history/missing"],
      ]);

      await openPage(page, "/test-errors/action");
      const fail = page.getByRole("button", { name: "Fail on purpose" });
      const alert = page.getByRole("alert").filter({ hasText: "Reference:" });
      await expect(async () => {
        if (!(await alert.isVisible())) await fail.press("Enter");
        await expect(alert).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await checkRenderedPage(page, theme);
      if (viewport.width === phone.width || viewport.width === desktop.width) {
        await expectNoSeriousViolations(page);
      }
      await page.screenshot({
        path: `test-results/visual/ui-13/action-error-${viewport.width}-${theme}.png`,
        fullPage: true,
      });

      if (viewport.width === phone.width) {
        await test.step("Compact navigation and event form clear emulated safe areas", async () => {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send("Emulation.setSafeAreaInsetsOverride", {
            insets: { top: 24, bottom: 34 },
          });
          await openPage(page, "/plan/calendar?view=day");
          await expect(page.locator(".top-app-bar")).toHaveCSS(
            "padding-top",
            "24px",
          );
          await expect(page.locator(".navigation-bar")).toHaveCSS(
            "padding-bottom",
            "34px",
          );
          const newEvent = page.getByRole("button", {
            name: "New event",
            exact: true,
          });
          const event = page.getByRole("dialog", { name: "New event" });
          await expect(async () => {
            if (!(await event.isVisible())) await newEvent.press("Enter");
            await expect(event).toBeVisible({ timeout: 1_000 });
          }).toPass({ timeout: 10_000 });
          await expect(event.locator(".form-dialog-footer")).toHaveCSS(
            "padding-bottom",
            "50px",
          );
          await expect(
            event.getByRole("button", { name: "Add event" }),
          ).toBeInViewport();
          await page.screenshot({
            path: `test-results/visual/ui-13/event-form-safe-area-390-${theme}.png`,
            animations: "disabled",
          });
        });
      }

      const guest = await browser.newContext({
        baseURL,
        viewport,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      await guest.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      try {
        const guestPage = await guest.newPage();
        await captureRoutes(guestPage, [
          ["landing", "/"],
          ["sign-in", "/sign-in"],
          ["sign-in-error", "/sign-in?error=account_not_linked"],
          ["privacy", "/privacy"],
          ["render-error", "/test-errors/render"],
          ["not-found", "/ui-13-missing"],
        ]);
      } finally {
        await guest.close();
      }
    });
  }
}

test.describe("Review Insights evidence", () => {
  test.use({ timezoneId: "UTC" });

  for (const viewport of sizes) {
    for (const theme of themes) {
      test(`@visual UI-12b Review Insights ${viewport.width} ${theme}`, async ({
        page,
      }) => {
        test.setTimeout(150_000);
        await page.setViewportSize(viewport);
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await page.addInitScript(
          (key) => localStorage.setItem(key, "system"),
          THEME_STORAGE_KEY,
        );
        const userId = await signInAndConfirm(page, "Alex Morgan");
        const capture = (name: string, fullPage = true) =>
          page.screenshot({
            path: `test-results/visual/ui-12b/${name}-${viewport.width}-${theme}.png`,
            fullPage,
            animations: "disabled",
          });

        await openPage(page, "/review");
        const navigation = page.getByRole("navigation", {
          name: "Review pages",
        });
        const insights = navigation.getByRole("link", { name: "Insights" });
        await expect(insights).toBeInViewport();
        await expect(
          page.getByRole("heading", {
            level: 2,
            name: "Look back",
            exact: true,
          }),
        ).toBeVisible();
        await capture("review-navigation", false);
        await insights.press("Enter");
        await expect(page.getByText("No task history yet.")).toBeVisible();
        await expectNoSeriousViolations(page);
        await capture("insights-empty");

        await seedInsightEvidence(userId);
        await openPage(page, "/review/insights");
        await expect(
          page.getByText("0 of 1 planned tasks completed"),
        ).toBeVisible();
        await expectNoSeriousViolations(page);
        await capture("insights");

        for (const width of [320, 375, 390, 414, 768, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        await capture("insights-zoom");
        await page.evaluate(() =>
          document.documentElement.style.removeProperty("font-size"),
        );

        const definition = page.getByRole("button", {
          name: "How this is counted: Planned versus completed",
        });
        const sheet = page.getByRole("dialog", { name: "How this is counted" });
        await expect(async () => {
          if (!(await sheet.isVisible())) await definition.press("Enter");
          await expect(sheet).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 15_000 });
        await expect(sheet.getByText("As of", { exact: true })).toBeVisible();
        await expectNoSeriousViolations(page);
        await capture("insight-definition", false);
        await page.keyboard.press("Escape");
        await expect(definition).toBeFocused();

        await page
          .getByRole("link", { name: "Review tasks in next week’s workload" })
          .press("Enter");
        await expect(insights).toHaveAttribute("aria-current", "page");
        await expect(
          page
            .getByRole("list", { name: "Tasks", exact: true })
            .getByRole("listitem"),
        ).toHaveCount(2);
        await expectNoSeriousViolations(page);
        await checkRenderedPage(page, theme);
        await capture("insight-tasks");

        await openPage(page, "/review/insights/missing?start=2026-01-01");
        await expect(
          page.getByRole("link", { name: "Back to Insights" }),
        ).toBeVisible();
        await expectNoSeriousViolations(page);
        await capture("insight-not-found");
      });
    }
  }
});

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-8 goals ${viewport.width} ${theme}`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const { goalId } = await seedVisualData(page, { goalsUI: true });
      const detailPath = `/goals/${goalId}`;
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-8/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
          caret: "initial",
        });
      for (const [name, path, heading] of [
        ["goals", "/goals", "Goals"],
        ["goal-detail", detailPath, GOAL_TITLE],
        ["life-areas", "/goals/areas", "Life areas"],
        ["archived-goals", "/goals/archived", "Archived goals"],
      ] as const) {
        await openPage(page, path);
        await expect(
          page.getByRole("heading", { level: 1, name: heading }),
        ).toBeVisible();
        await checkRenderedPage(page, theme);
        await capture(name);
        for (const width of [320, 375, 390, 414, 768, 840, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        if (name === "goal-detail") await capture("goal-detail-zoom");
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("font-size");
        });
      }

      await chooseGoalMenuItem(
        page,
        "Delete…",
        "Actions for Organize the winter walking group",
      );
      const warning = page.getByRole("alertdialog");
      await expect(warning).toContainText("1 linked note");
      await capture("archived-goal-delete", false);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", {
          name: "Actions for Organize the winter walking group",
        }),
      ).toBeFocused();

      await openPage(page, "/goals/areas");
      await chooseGoalMenuItem(page, "Edit", "Actions for Health");
      const form = page.getByRole("dialog", { name: "Edit life area" });
      await expect(form.getByRole("radio", { name: "Teal" })).toBeChecked();
      await capture("area-form", false);
      await page.keyboard.press("Escape");

      await openPage(page, detailPath);
      const before = page.getByRole("img", {
        name: "1 of 3 milestones completed",
      });
      const check = page.getByRole("checkbox", {
        name: "Try the riverside path",
      });
      await expect(before).toBeVisible();
      const hold = await holdMilestoneSave(page, detailPath);
      await check.press("Space");
      try {
        await hold.requested;
        await expect(check).toHaveAttribute("aria-busy", "true");
        await expect(before).toBeVisible();
        await capture("milestone-pending");
      } finally {
        hold.release();
      }
      await expect(
        page.getByRole("region", { name: "Milestones" }).getByRole("alert"),
      ).toBeVisible();
      await capture("milestone-error");
      await hold.stop();
      await check.press("Space");
      await expect(
        page.getByRole("img", { name: "2 of 3 milestones completed" }),
      ).toBeVisible();
      await expect(check).toBeChecked();
      await capture("milestone-retry-saved");

      await openPage(page, "/goals?status=paused");
      await expect(
        page.getByRole("link", { name: "Make a small herb garden" }),
      ).toBeVisible();
      await capture("goals-paused");
      await openPage(page, "/goals?status=dropped");
      await expect(
        page.getByRole("link", { name: "Back to Active" }),
      ).toBeVisible();
      await capture("goals-filter-empty");

      await signInAndConfirm(page, "Rowan Reed");
      await openPage(page, "/goals/areas");
      await expect(
        page.getByRole("heading", { name: "Start with some suggestions?" }),
      ).toBeVisible();
      await capture("life-areas-starter");
    });
  }
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-7 calendar ${viewport.width} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const { today } = await seedVisualData(page, { calendar: true });
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-7/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
        });
      const series = page.getByRole("button", {
        name: CALENDAR_SERIES_TITLE,
        exact: true,
      });

      for (const view of ["agenda", "week", "day", "areas", "timeline"]) {
        await openPage(
          page,
          `/plan/calendar?view=${view}${view === "timeline" ? "&span=day" : ""}`,
        );
        if (view === "week" && viewport.width === 390) {
          await expect(page).toHaveURL(/view=day$/);
        }
        await expect(series.first()).toBeVisible();
        await checkRenderedPage(page, theme);
        await capture(
          view === "week" && viewport.width === 390
            ? "week-fallback-day"
            : view,
        );
        if (view === "week") continue;
        for (const width of [320, 375, 390, 414, 768, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("font-size");
        });
      }

      await openPage(page, "/plan/calendar?view=day");
      const picker = page.getByRole("dialog", { name: "Go to date" });
      await page.getByRole("button", { name: /^Go to date,/ }).press("Enter");
      await expect(picker.getByRole("grid")).toBeVisible();
      await capture("date-picker", false);
      await page.keyboard.press("ArrowRight");
      await expect(
        picker.locator('[role="gridcell"][aria-selected="true"] button'),
      ).not.toBeFocused();
      await page.keyboard.press("Escape");
      await expect(picker).toHaveCount(0);

      const newEvent = page.getByRole("button", {
        name: "New event",
        exact: true,
      });
      await newEvent.press("Enter");
      const event = page.getByRole("dialog", { name: "New event" });
      const title = event.getByLabel("Title", { exact: true });
      await expect(title).toBeFocused();
      await title.fill("Pick up prints for the neighborhood exhibition");
      await event.getByLabel("Start date").fill(today);
      await event.getByLabel("Start time").fill("12:00");
      await capture("event-form", false);

      const release = Promise.withResolvers<void>();
      const requested = Promise.withResolvers<void>();
      const calendarRoute = (url: URL) => url.pathname === "/plan/calendar";
      await page.route(calendarRoute, async (route) => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["next-action"])
          return route.continue();
        requested.resolve();
        await release.promise;
        const [input] = request.postDataJSON() as [{ title: string }];
        await route.continue({
          postData: JSON.stringify([{ ...input, title: "" }]),
        });
      });
      const add = event.getByRole("button", { name: "Add event", exact: true });
      await add.click();
      try {
        await requested.promise;
        const saving = event.getByRole("button", { name: "Saving…" });
        await expect(saving).toBeDisabled();
        await expect(saving).toHaveAttribute("aria-busy", "true");
        await capture("event-pending", false);
      } finally {
        release.resolve();
      }
      await expect(title).toHaveAttribute("aria-invalid", "true");
      await expect(title).toHaveValue(
        "Pick up prints for the neighborhood exhibition",
      );
      await expect(title).toBeFocused();
      await capture("event-error", false);
      await page.unroute(calendarRoute);
      await add.click();
      await expect(event).toHaveCount(0);
      const saved = page.getByRole("button", {
        name: "Pick up prints for the neighborhood exhibition",
        exact: true,
      });
      await expect(saved).toBeVisible();
      await saved.scrollIntoViewIfNeeded();
      await capture("event-retry-saved", false);

      await series.click();
      const edit = page.getByRole("dialog", { name: "Edit event" });
      await edit.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        edit.getByRole("radio", { name: "This event", exact: true }),
      ).toBeFocused();
      await capture("event-scope", false);
      await edit.getByRole("button", { name: "Back" }).click();
      await edit
        .getByRole("button", { name: `Delete: ${CALENDAR_SERIES_TITLE}` })
        .click();
      const removeEvent = page.getByRole("alertdialog");
      await expect(
        removeEvent.getByRole("radio", { name: "All events" }),
      ).toHaveAccessibleDescription(/changed separately/);
      await capture("event-delete-warning", false);
      await page.keyboard.press("Escape");
      await expect(removeEvent).toHaveCount(0);
      await expect(
        edit.getByRole("button", { name: `Delete: ${CALENDAR_SERIES_TITLE}` }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(series).toBeFocused();

      const block = page.getByRole("button", {
        name: CALENDAR_BLOCK_TITLE,
        exact: true,
      });
      await block.click();
      const details = page.getByRole("dialog", {
        name: "Time block",
        exact: true,
      });
      await expect(details).toBeVisible();
      await capture("block-details", false);
      await details.getByRole("button", { name: "Delete block" }).click();
      await expect(
        page
          .getByRole("alertdialog")
          .getByRole("radio", { name: "This block", exact: true }),
      ).toBeFocused();
      await capture("block-delete", false);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(
        details.getByRole("button", { name: "Delete block" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(block).toBeFocused();

      // Drag the real block by one hour, then dismiss the scope prompt and verify reversion.
      await block.scrollIntoViewIfNeeded();
      const box = (await block.boundingBox())!;
      const [slot, nextSlot] = await page
        .locator(".soleup-calendar-day [data-time]")
        .evaluateAll((slots) => {
          const lanes = slots.filter((element) =>
            element.getAttribute("data-time")?.startsWith("08:"),
          );
          return lanes
            .map((element) => element.getBoundingClientRect().y)
            .filter((y, index, all) => all.indexOf(y) === index);
        });
      const halfHour = Math.abs((nextSlot ?? 0) - (slot ?? 0));
      expect(halfHour).toBeGreaterThan(0);
      await page.mouse.move(box.x + 12, box.y + 8);
      await page.mouse.down();
      await page.mouse.move(box.x + 12, box.y + 8 + halfHour * 2, {
        steps: 10,
      });
      await page.mouse.up();
      const move = page.getByRole("dialog", { name: "Move block" });
      await expect(
        move.getByRole("radio", { name: "This block", exact: true }),
      ).toBeFocused();
      await expect(
        move.getByRole("button", { name: "Save", exact: true }),
      ).toBeEnabled();
      await capture("block-move", false);
      await page.keyboard.press("Escape");
      await expect(move).toHaveCount(0);
      await expect(block).toHaveAccessibleDescription(/8:30 AM/);

      const blockTrigger = page.getByRole("button", {
        name: "Block time",
        exact: true,
      });
      await blockTrigger.click();
      const blockForm = page.getByRole("dialog", {
        name: "Block time",
        exact: true,
      });
      await blockForm
        .getByLabel("Task", { exact: true })
        .selectOption({ label: CALENDAR_BLOCK_TITLE });
      await capture("block-form", false);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await checkRenderedPage(page, theme);
      await expect(
        blockForm.getByRole("button", { name: "Block time", exact: true }),
      ).toBeInViewport();
    });
  }
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-6 task lists ${viewport.width} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      await seedVisualData(page, { plan: true });

      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-6/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
        });
      for (const [route, name] of [
        ["/plan", "plan"],
        ["/plan/upcoming", "upcoming"],
        ["/plan/inbox", "inbox"],
      ] as const) {
        await openPage(page, route);
        await expect(
          page.getByRole("main").getByRole("listitem").first(),
        ).toBeVisible();
        for (const width of [320, 375, 390, 414, 768, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        if (name === "plan") {
          await expect(
            page
              .getByRole("navigation", { name: "Plan", exact: true })
              .getByRole("link", { name: "All tasks" }),
          ).toBeInViewport();
        }
        await expectNoSeriousViolations(page);
        await capture(name);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        await capture(`${name}-text-200`);
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("font-size");
        });
      }

      const inbox = page.getByRole("list", { name: "Inbox tasks" });
      await inbox
        .getByRole("checkbox", { name: `Select ${INBOX_TASK}` })
        .press("Space");
      await inbox
        .getByRole("checkbox", { name: "Select Return the library books" })
        .press("Space");
      const selected = page.getByRole("group", { name: "Selected tasks" });
      await expect(selected).toContainText("2 selected");
      await capture("inbox-selection", false);
      await expectNoSeriousViolations(page);
      const assign = selected.getByRole("button", { name: "Assign to goal" });
      await assign.press("Enter");
      const assignment = page.getByRole("dialog", { name: "Assign to goal" });
      await expect(assignment.getByLabel("Goal or milestone")).toBeFocused();
      await capture("inbox-assign", false);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(assign).toBeFocused();

      await openPage(page, "/plan");
      const filters = page.getByRole("region", {
        name: "Filter and sort tasks",
      });
      const due = filters.getByRole("button", { name: "Due", exact: true });
      const dueSheet = page.getByRole("dialog", { name: "Due" });
      await expect(async () => {
        if (!(await dueSheet.isVisible())) await due.press("Enter");
        await expect(dueSheet).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await capture("plan-due-filter", false);
      await expectNoSeriousViolations(page);
      await dueSheet.getByRole("radio", { name: "Next 7 days" }).press("Space");
      await dueSheet.getByRole("button", { name: "Apply" }).press("Enter");
      await expect(page).toHaveURL(/\/plan\?due=next7$/);
      await expect(due).toBeFocused();
      await capture("plan-filtered");

      const task = page.getByRole("button", {
        name: UPCOMING_TASK,
        exact: true,
      });
      await task.press("Enter");
      const edit = page.getByRole("dialog", { name: "Edit task" });
      const title = edit.getByLabel("Title", { exact: true });
      await expect(title).toBeFocused();
      await capture("task-edit", false);
      await expectNoSeriousViolations(page);
      await edit.getByRole("button", { name: "Delete…" }).focus();
      await capture("task-edit-actions", false);
      await expect(
        edit.getByRole("button", { name: "Save", exact: true }),
      ).toBeInViewport();
      await edit.getByRole("button", { name: "Delete…" }).press("Enter");
      const deletion = page.getByRole("alertdialog");
      await expect(deletion).toContainText("It can't be undone.");
      await capture("task-delete", false);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(edit.getByRole("button", { name: "Delete…" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(task).toBeFocused();

      const finish = Promise.withResolvers<void>();
      const requestStarted = Promise.withResolvers<void>();
      const complete = page.getByRole("checkbox", {
        name: `Complete ${UPCOMING_TASK}`,
      });
      const finishRoute = (url: URL) => url.pathname === "/plan";
      await page.route(finishRoute, async (route) => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["next-action"])
          return route.continue();
        requestStarted.resolve();
        await finish.promise;
        const [input] = request.postDataJSON() as [
          { id: string; status: string },
        ];
        await route.continue({
          postData: JSON.stringify([{ ...input, status: "invalid" }]),
        });
      });
      await complete.press("Space");
      try {
        await requestStarted.promise;
        await expect(complete).toHaveAttribute("aria-busy", "true");
        await expect(complete).not.toBeChecked();
        await capture("task-completion-pending", false);
      } finally {
        finish.resolve();
      }
      await expect(
        page.getByRole("list", { name: "Tasks" }).getByRole("alert"),
      ).toBeVisible();
      await expect(complete).toBeFocused();
      await capture("task-completion-error", false);
      await page.unroute(finishRoute);
      await complete.press("Space");
      await expect(
        page.getByText("Task completed", { exact: true }),
      ).toBeVisible();
      await expect(complete).toHaveCount(0);
      await capture("task-completion-retry", false);

      await openPage(page, "/plan");
      await openQuickAdd(page);
      const quick = page.getByRole("dialog", { name: "Add task" });
      await expect(quick.getByLabel("Task title")).toBeFocused();
      if (viewport.width === 1280)
        expect((await quick.boundingBox())?.width).toBe(480);
      await capture("quick-add", false);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Create", exact: true }),
      ).toBeFocused();
    });
  }
}

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
          page
            .getByRole("dialog", { name: "Add task" })
            .getByLabel("Task title"),
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
      const loadingStates = column
        .locator("section.card")
        .filter({
          has: page.getByRole("heading", {
            name: "Loading indicator, skeleton and loading state",
          }),
        })
        .last();
      await expect(loadingStates).toBeVisible();
      await loadingStates.screenshot({
        path: path("loading-states"),
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
    `page overflow at ${page.viewportSize()?.width}px on ${new URL(page.url()).pathname}${new URL(page.url()).search}`,
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
      await expect(dialog.getByLabel("Task title")).toBeFocused();
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
        const title = dialog.getByLabel("Task title");
        await title.fill("Pack an extra water bottle");
        await dialog.getByRole("button", { name: "Add", exact: true }).click();
        try {
          await expect(
            dialog.getByRole("button", { name: "Add", exact: true }),
          ).toBeDisabled();
          await capture("home-quick-add-pending");
        } finally {
          finishRequest.resolve();
        }
        await expect(title).toHaveAttribute("aria-invalid", "true");
        await expect(title).toHaveValue("Pack an extra water bottle");
        await capture("home-quick-add-error");
        await page.unroute("**/home");
        await dialog.getByRole("button", { name: "Add", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByText("Added to Inbox", { exact: true }),
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
for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-9 Track ${viewport.width} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      await seedVisualData(page, { track: true });
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-9/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
          caret: "initial",
        });
      for (const [range, path] of [
        ["week", "/track?range=week"],
        ["4w", "/track"],
        ["12w", "/track?range=12w"],
      ]) {
        await openPage(page, path!);
        await expect(
          page.getByRole("heading", { name: DAILY_HABIT }),
        ).toBeVisible();
        await checkRenderedPage(page, theme);
        await capture("track-" + range);
        for (const width of [320, 375, 390, 414, 768, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        if (range === "4w") await capture("track-4w-zoom");
        await page.evaluate(() =>
          document.documentElement.style.removeProperty("font-size"),
        );
      }

      await openPage(page, "/track");
      await page.getByRole("button", { name: "Legend", exact: true }).click();
      await expect(
        page
          .getByRole("list", { name: "What the days show" })
          .getByRole("listitem"),
      ).toHaveCount(10);
      await capture("track-legend");
      await page.getByRole("button", { name: "Legend", exact: true }).click();
      await page
        .getByRole("button", { name: "How this is counted: " + QUANTITY_HABIT })
        .click();
      await expect(
        page.getByRole("dialog", { name: "How this is counted" }),
      ).toBeVisible();
      await capture("track-definition", false);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /: 6 of 12 pages$/ }).click();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("textbox", { name: "Amount (pages)" }),
      ).toHaveValue("6");
      await capture("track-quantity-log", false);
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "New habit", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "New habit" });
      await dialog
        .getByRole("radio", { name: "On chosen days", exact: true })
        .click();
      await capture("habit-form", false);

      await openPage(page, "/track/archived");
      await expect(
        page.getByRole("heading", { name: "Practice guitar" }),
      ).toBeVisible();
      await checkRenderedPage(page, theme);
      await capture("track-archived");
    });
  }
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-10 review ${viewport.width} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );

      const { lastWeek, reviewId, pastReviewId } = await seedVisualData(page, {
        goalsUI: true,
        plan: true,
        reviewUI: true,
      });
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-10/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
          caret: "initial",
        });

      for (const [state, path, heading] of [
        ["look-back", reviewHref(lastWeek), "Look back"],
        ["reflect", reviewHref(lastWeek, "reflect"), "Reflect"],
        ["adjust", reviewHref(lastWeek, "adjust"), "Adjust"],
        ["priorities", reviewHref(lastWeek, "priorities"), "Choose priorities"],
        ["history", "/review/history", "Past reviews"],
        ["detail-open", `/review/history/${reviewId}`, "Reflect"],
        ["detail-closed", `/review/history/${pastReviewId}`, "Reflect"],
      ] as const) {
        await openPage(page, path);
        await expect(
          page.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        await checkRenderedPage(page, theme);
        await capture(state);
        if (state === "look-back")
          await capture("look-back-first-screen", false);
        for (const width of [320, 375, 390, 414, 768, 840, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        if (state === "priorities") await capture("priorities-zoom");
        await page.evaluate(() =>
          document.documentElement.style.removeProperty("font-size"),
        );
      }

      await openPage(page, reviewHref(lastWeek));
      const info = page.getByRole("button", {
        name: "How this is counted: Tasks completed",
      });
      const definition = page.getByRole("dialog", {
        name: "How this is counted",
      });
      await expect(async () => {
        if (!(await definition.isVisible())) await info.press("Enter");
        await expect(definition).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 10_000 });
      await expect(definition).toContainText("As of");
      await capture("metric-definition", false);
      await page.keyboard.press("Escape");
      await expect(info).toBeFocused();

      // Hold a real Reflect write under reduced motion and make the server reject
      // its modified content. Retry submits the unchanged browser draft.
      await page.getByRole("button", { name: "Next: Reflect" }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Reflect", exact: true }),
      ).toBeVisible();
      const winsText = "Took the riverside route before the rain.";
      const wins = page.getByLabel("Wins", { exact: true });
      const next = page.getByRole("button", { name: "Next: Adjust" });
      await expect(async () => {
        await wins.fill(winsText);
        await expect(wins).toHaveValue(winsText, { timeout: 500 });
      }).toPass({ timeout: 10_000 });
      const requested = Promise.withResolvers<void>();
      const held = Promise.withResolvers<void>();
      const reviewRoute = (url: URL) => url.pathname === "/review";
      await page.route(reviewRoute, async (route) => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["next-action"]) {
          await route.continue();
          return;
        }
        requested.resolve();
        await held.promise;
        const body = request.postData()!;
        const invalid = body.replace(winsText, "x".repeat(REVIEW_TEXT_MAX + 1));
        expect(invalid).not.toBe(body);
        await route.continue({ postData: invalid });
      });
      await next.click();
      try {
        await requested.promise;
        await expect(
          page.getByRole("status").getByText("Saving…"),
        ).toBeVisible();
        await expect(next).toBeDisabled();
        await capture("reflect-pending");
      } finally {
        held.resolve();
      }
      await expect(
        page.getByRole("status").getByText("Not saved"),
      ).toBeVisible();
      await expect(wins).toHaveValue(winsText);
      await capture("reflect-error");
      await page.unroute(reviewRoute);
      await page
        .getByRole("button", { name: "Retry", exact: true })
        .press("Enter");
      await expect(
        page.getByRole("status").getByText("Saved", { exact: true }),
      ).toBeVisible();
      await expect(wins).toHaveValue(winsText);
      await capture("reflect-retry-saved");

      await next.click();
      await page
        .getByRole("button", { name: "Next: Choose priorities" })
        .click();
      await page.getByRole("button", { name: "Finish review" }).click();
      const saved = page.getByRole("dialog", { name: "Your review is saved" });
      await expect(saved).toContainText("You can change it until");
      await capture("finish", false);
      await saved
        .getByRole("button", { name: "Done", exact: true })
        .press("Enter");
      await expect(saved).toHaveCount(0);
      const week = page.getByRole("region", { name: "Reviewed week" });
      await expect(week).toContainText("Finished on");
      await capture("finished-open");

      await openPage(page, `/review/history/${pastReviewId}`);
      const menu = page.getByRole("button", { name: "Review options" });
      await menu.press("Enter");
      await page.getByRole("menuitem", { name: "Delete…" }).press("Enter");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await capture("delete-confirmation", false);
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
    });
  }
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-11 notes and search ${viewport.width} ${theme}`, async ({
      page,
      context,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const { noteId, archivedNoteId, goalId } = await seedVisualData(page, {
        notesUI: true,
        goalsUI: true,
        plan: true,
      });
      const editorPath = `/notes/${noteId}`;
      const body = page.getByRole("textbox", { name: "Note", exact: true });
      const title = page.getByRole("textbox", { name: "Title" });
      const status = page
        .getByRole("status")
        .filter({ hasText: /^(Saving…|Saved|Not saved)$/ });
      const search = page.getByRole("searchbox", { name: "Search for" });
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-11/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
          caret: "initial",
        });

      for (const [state, href, ready] of [
        [
          "notes",
          "/notes",
          page.getByRole("link", { name: "Weekend walking routes" }),
        ],
        [
          "new",
          `/notes/new?goal=${goalId}`,
          page.getByText(`Will link to: ${GOAL_TITLE}`, { exact: true }),
        ],
        ["editor", editorPath, body],
        [
          "archived",
          "/notes/archived",
          page.getByRole("list", { name: "Archived notes" }),
        ],
        [
          "archived-note",
          `/notes/${archivedNoteId}`,
          page.getByRole("article", { name: "Note" }),
        ],
        ["tags", "/notes/tags", page.getByRole("list", { name: "Tags" })],
        ["search", "/notes/search", search],
      ] as const) {
        await openPage(page, href);
        await expect(ready).toBeVisible();
        if (state === "editor")
          await expect(
            page.getByRole("button", { name: "Unlink " + GOAL_TITLE }),
          ).toBeVisible();
        await expectNoSeriousViolations(page);
        await checkRenderedPage(page, theme);
        await capture(state);
        for (const width of [320, 375, 390, 414, 768, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        if (state === "editor" || state === "search")
          await capture(`${state}-zoom`);
        await page.evaluate(() =>
          document.documentElement.style.removeProperty("font-size"),
        );
      }

      await expect(search).toBeFocused();
      await search.fill("walk");
      await search.press("Enter");
      await expect(
        page
          .getByRole("region", { name: "Tasks", exact: true })
          .locator("mark"),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      await capture("search-results");

      await openPage(page, editorPath);
      const pickerTrigger = page.getByRole("button", {
        name: "Link a goal or task",
      });
      await pickerTrigger.click();
      const picker = page.getByRole("dialog", { name: "Link a goal or task" });
      await expect(picker.getByRole("searchbox")).toBeFocused();
      await expect(picker.getByRole("region", { name: "Goals" })).toContainText(
        "Linked",
      );
      await expectNoSeriousViolations(page);
      await capture("link-picker", false);
      await page.keyboard.press("Escape");
      await expect(pickerTrigger).toBeFocused();

      if (viewport.width === 390) {
        // Emulate a soft keyboard that also pans the visual viewport.
        await body.focus();
        await page.evaluate(() => {
          const vv = window.visualViewport!;
          Object.defineProperties(vv, {
            height: { configurable: true, value: 480 },
            offsetTop: { configurable: true, value: 32 },
          });
          vv.dispatchEvent(new Event("resize"));
          vv.dispatchEvent(new Event("scroll"));
        });
        const toolbar = page.getByRole("group", { name: "Formatting" });
        await expect
          .poll(async () => {
            const bounds = await toolbar.boundingBox();
            return bounds && Math.round(bounds.y + bounds.height);
          })
          .toBe(504);
        await expect(
          page.getByRole("navigation", { name: "Main" }),
        ).toBeHidden();
        await capture("keyboard-dock", false);
        await page.evaluate(() => {
          const vv = window.visualViewport!;
          Reflect.deleteProperty(vv, "height");
          Reflect.deleteProperty(vv, "offsetTop");
          vv.dispatchEvent(new Event("resize"));
        });
      }

      // Hold the POST until Saving is visible, then simulate an offline failure.
      const requested = Promise.withResolvers<void>();
      const held = Promise.withResolvers<void>();
      const noteRoute = (url: URL) => url.pathname === editorPath;
      const savedTitle = "Walking route draft";
      await page.route(noteRoute, async (route) => {
        const request = route.request();
        if (
          request.method() !== "POST" ||
          !request.headers()["next-action"] ||
          !request.postData()?.includes(savedTitle)
        ) {
          await route.fallback();
          return;
        }
        requested.resolve();
        await held.promise;
        await route.abort("internetdisconnected");
      });
      await title.fill(savedTitle);
      try {
        await requested.promise;
        await expect(status).toHaveText("Saving…");
        await expect(status.locator(".loading-indicator")).toHaveCSS(
          "animation-name",
          "none",
        );
        await capture("saving", false);
      } finally {
        held.resolve();
      }
      await expect(status).toHaveText("Not saved");
      await expect(title).toHaveValue(savedTitle);
      await expectNoSeriousViolations(page);
      await capture("save-error");
      await page.unroute(noteRoute);
      await page
        .getByRole("button", { name: "Retry", exact: true })
        .press("Enter");
      await expect(status).toHaveText("Saved");
      await expect(title).toHaveValue(savedTitle);
      await expect(page.locator("[data-feedback-halo]")).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: /Notifications/ }).getByText(/saved/i),
      ).toHaveCount(0);
      await capture("retry-saved");

      const stale = await context.newPage();
      try {
        await stale.setViewportSize(viewport);
        await stale.emulateMedia({
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await openPage(stale, editorPath);
        const staleTitle = stale.getByRole("textbox", { name: "Title" });
        await expect(staleTitle).toHaveValue(savedTitle);
        await title.fill("Saved in the first tab");
        await expect(status).toHaveText("Saved");
        await staleTitle.fill("Local text in tab two");
        await expect(
          stale.getByRole("alert").filter({
            hasText: "This note changed somewhere else.",
          }),
        ).toBeVisible();
        await expect(staleTitle).toHaveValue("Local text in tab two");
        await expectNoSeriousViolations(stale);
        await stale.screenshot({
          path: `test-results/visual/ui-11/conflict-${viewport.width}-${theme}.png`,
          fullPage: true,
          animations: "disabled",
          caret: "initial",
        });
      } finally {
        await stale.close();
      }
    });
  }
}

for (const viewport of sizes) {
  for (const theme of themes) {
    test(`@visual UI-12 settings and public entry ${viewport.width} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const capture = (state: string, fullPage = true) =>
        page.screenshot({
          path: `test-results/visual/ui-12/${state}-${viewport.width}-${theme}.png`,
          fullPage,
          animations: "disabled",
        });

      async function verifyRoute(name: string) {
        await expectNoSeriousViolations(page);
        await capture(name);
        for (const width of [320, 375, 390, 414, 768, 840, 1280]) {
          await page.setViewportSize({ width, height: viewport.height });
          await checkRenderedPage(page, theme);
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await checkRenderedPage(page, theme);
        await capture(`${name}-zoom`);
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("font-size");
        });
      }

      await openPage(page, "/");
      await expect(
        page.getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await verifyRoute("landing");
      await page
        .getByRole("link", { name: "Sign in", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(
        page.getByRole("button", { name: "Continue with Google" }),
      ).toBeVisible();
      await verifyRoute("sign-in");

      await openPage(page, "/sign-in?error=account_not_linked");
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Sign in with the provider you used before",
      );
      await expectNoSeriousViolations(page);
      await capture("sign-in-error");

      await openPage(page, "/ui-12-missing");
      await expect(
        page.getByRole("heading", { name: "We couldn't find that" }),
      ).toBeVisible();
      await verifyRoute("not-found");

      await openPage(page, "/test-errors/render");
      await expect(
        page.getByRole("heading", { name: "Something went wrong" }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText(/Reference: \S+/);
      await verifyRoute("error");

      const userId = await signInAndConfirm(page, "Alex Morgan");
      await openPage(page, "/");
      await expect(
        page.getByRole("link", { name: "Go to Home" }),
      ).toBeVisible();
      await verifyRoute("landing-signed-in");
      await openPage(page, "/account");
      await expect(page.getByRole("region", { name: "Profile" })).toContainText(
        "Alex Morgan",
      );
      await verifyRoute("account");

      await openPage(page, "/settings");
      await expect(
        page.getByText("No device is set up for notifications yet", {
          exact: false,
        }),
      ).toBeVisible();
      await verifyRoute("settings");
      await capture("settings-first-screen", false);

      const index = page.getByRole("navigation", { name: "On this page" });
      const search = page.getByRole("searchbox", { name: "Search settings" });
      await search.fill("dark mode");
      await expect(index.getByRole("link")).toHaveCount(1);
      await capture("settings-search", false);
      await search.press("Escape");
      const appearance = index.getByRole("link", { name: "Appearance" });
      await appearance.press("Enter");
      await expect(page).toHaveURL(/\/settings#appearance$/);
      if (viewport.width >= 1200) {
        await expect(appearance).toHaveAttribute("aria-current", "true");
        await page.locator("#reminders").evaluate((section) => {
          section.scrollIntoView({ block: "start", behavior: "instant" });
        });
        await expect
          .poll(
            async () =>
              (
                await page
                  .getByRole("search", { name: "Settings" })
                  .boundingBox()
              )?.y,
          )
          .toBeLessThan(80);
      }
      const group = page.getByRole("radiogroup", { name: "Color theme" });
      const explicit = group.getByRole("radio", {
        name: theme === "dark" ? "Dark" : "Light",
      });
      await explicit.press("Space");
      await expect(explicit).toBeChecked();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await capture("appearance-selected", false);

      const preferences = page.getByRole("region", { name: "Time and region" });
      await preferences.getByLabel("Language and region").selectOption("de-DE");
      const save = preferences.getByRole("button", {
        name: "Save",
        exact: true,
      });
      const requested = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      await page.route("**/settings", async (route) => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["next-action"]) {
          return route.continue();
        }
        requested.resolve();
        await release.promise;
        return route.abort("failed");
      });
      try {
        await save.press("Enter");
        await requested.promise;
        await expect(
          preferences.getByRole("button", { name: "Saving…" }),
        ).toBeDisabled();
        await capture("preferences-pending", false);
      } finally {
        release.resolve();
      }
      await expect(preferences.getByRole("status")).toHaveText("Not saved");
      await expect(preferences.getByRole("alert")).toContainText(
        "Please try again",
      );
      await expect(preferences.getByLabel("Language and region")).toHaveValue(
        "de-DE",
      );
      await capture("preferences-error", false);
      await page.unroute("**/settings");
      await save.press("Enter");
      await expect(preferences.getByRole("status")).toHaveText("Saved", {
        timeout: 15_000,
      });
      await capture("preferences-retry", false);

      await seedVisualDevice(userId);
      await page.goto("/home");
      await page.goto("/settings#notifications");
      const notificationSection = page.getByRole("region", {
        name: "Notifications",
        exact: true,
      });
      const devices = page.getByRole("region", { name: "Your devices" });
      await expect(devices.getByText("2 failed attempts")).toBeVisible();
      await expect(page.getByText("Checking this device…")).toHaveCount(0);
      await expect
        .poll(async () => (await notificationSection.boundingBox())?.y)
        .toBeLessThan(160);
      if (viewport.width === 390) {
        await expect(page.locator(".top-app-bar")).not.toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
      }
      await capture("notifications-device", false);
      const menu = devices.getByRole("button", {
        name: "Actions for Chrome on Android",
      });
      await menu.press("Enter");
      await page.getByRole("menuitem", { name: "Remove…" }).press("Enter");
      const dialog = page.getByRole("alertdialog", {
        name: "Remove Chrome on Android?",
      });
      await expect(dialog).toBeVisible();
      await expectNoSeriousViolations(page);
      await capture("notifications-remove", false);
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();

      await openPage(page, "/goals/missing");
      await expect(
        page.getByRole("link", { name: "Back to Goals" }),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      await capture("goal-not-found");
    });
  }
}
