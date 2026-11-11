import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations } from "./helpers";
import {
  DAILY_HABIT,
  EVENT_TITLE,
  GOAL_TITLE,
  seedVisualData,
  VISUAL_ZONE,
} from "./visual-data";

test.skip(!process.env.SOLEUP_VISUAL, "visual capture only");
test.use({ timezoneId: VISUAL_ZONE, locale: "en-US" });

const output = "test-results/visual/ui-1";
const sizes = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const themes = ["light", "dark"] as const;

async function openPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^Loading/ }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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
    test(`@visual UI-1 ${viewport.width} ${colorScheme}`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
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
          if (
            core.some(([coreName]) => coreName === name) ||
            name.startsWith("calendar") ||
            name === "goals-areas"
          )
            await expectNoSeriousViolations(page);
        });
      }

      // Public routes, including sign-in, need a fresh session.
      const guestContext = await page
        .context()
        .browser()!
        .newContext({ viewport, colorScheme, reducedMotion: "reduce" });
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
      await page.getByRole("link", { name: "SoleUp", exact: true }).focus();
      await page.keyboard.press("Tab");
      const add = page.getByRole("button", { name: "Add task", exact: true });
      await expect(add).toBeFocused();
      await expect(add).toHaveCSS("outline-width", "3px");
      await expect(add).toHaveCSS("outline-offset", "2px");
      await expect(add).toHaveCSS("box-shadow", /inset/);
      await capture("home-keyboard-focus");
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
        await expect(page.locator("body")).toHaveCSS(
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
        await page.keyboard.press("Enter");
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
