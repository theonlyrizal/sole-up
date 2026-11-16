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

/** Read the choice already applied by the pre-paint script. */
export function readThemeChoice(): ThemeChoice {
  const root = document.documentElement;
  if (root.hasAttribute("data-theme-system")) return "system";
  return root.dataset.theme === "dark" ? "dark" : "light";
}

/** The visual change still works when browser storage is blocked. */
export function saveThemeChoice(choice: ThemeChoice): boolean {
  const root = document.documentElement;
  root.toggleAttribute("data-theme-system", choice === "system");
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** The only interpolated value is our fixed storage key, never user input. */
export function themeInitScript(): string {
  return `(() => {
    try {
      const choice = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      const root = document.documentElement;
      if (choice === "light" || choice === "dark") {
        root.dataset.theme = choice;
      } else if (choice === "system") {
        root.setAttribute("data-theme-system", "");
      }
    } catch {
      // Storage can be blocked. CSS keeps the light default.
    }
  })();`;
}
