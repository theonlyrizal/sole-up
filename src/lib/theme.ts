export const THEME_STORAGE_KEY = "soleup.theme";

export type ThemeChoice = "system" | "light" | "dark";

// Browser chrome and installed-app artwork use the same colors as globals.css.
export const CANVAS_COLORS = { light: "#F7F4EC", dark: "#191F19" } as const;
export const FOREST_GREEN = "#214839";

export function resolveTheme(
  choice: ThemeChoice,
  prefersDark: boolean,
): "light" | "dark" {
  return choice === "system" ? (prefersDark ? "dark" : "light") : choice;
}

/** The only interpolated value is our fixed storage key, never user input. */
export function themeInitScript(): string {
  return `(() => {
    try {
      const choice = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      if (choice === "light" || choice === "dark") {
        document.documentElement.dataset.theme = choice;
      }
    } catch {
      // Storage can be blocked. CSS still follows the system.
    }
  })();`;
}
