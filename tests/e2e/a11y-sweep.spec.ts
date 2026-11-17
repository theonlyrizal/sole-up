import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { auditThemes, desktop, phone, seedAuditRoutes } from "./audit-routes";
import { openRenderedPage } from "./helpers";
import { VISUAL_ZONE } from "./visual-data";

test.use({ timezoneId: VISUAL_ZONE, locale: "en-US" });

for (const viewport of [phone, desktop]) {
  for (const theme of auditThemes) {
    test(`WCAG A/AA on every authenticated page at ${viewport.width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const routes = await seedAuditRoutes(page);

      for (const [name, path] of routes) {
        await test.step(name, async () => {
          await openRenderedPage(page, path);
          await expect(page).toHaveURL(new URL(path, page.url()).href);
          await expect(page.locator("body")).toHaveCSS("color-scheme", theme);
          await expect(page.getByRole("main")).toBeVisible();
          const { violations } = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          expect
            .soft(
              violations.map(({ id, impact, nodes }) => ({
                id,
                impact,
                targets: nodes.map(({ target, failureSummary }) => ({
                  target,
                  failureSummary,
                })),
              })),
              `${name} (${path})`,
            )
            .toEqual([]);
        });
      }
    });
  }
}
