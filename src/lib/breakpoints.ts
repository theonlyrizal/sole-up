/** M3 window-size classes in CSS pixels at the browser's default font size. */
export const BREAKPOINTS = {
  medium: 600,
  expanded: 840,
  large: 1200,
  xlarge: 1600,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export function mediaQuery(name: Breakpoint): string {
  return `(min-width: ${BREAKPOINTS[name] / 16}rem)`;
}

/** Preserve Tailwind's md and lg boundaries until the Calendar redesign. */
export const CALENDAR_QUERIES = {
  week: "(min-width: 48rem)",
  taskPanel: "(min-width: 64rem)",
} as const;
