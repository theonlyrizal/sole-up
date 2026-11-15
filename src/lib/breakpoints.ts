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

/** The calendar's original Week to Day cutoff. */
export const CALENDAR_QUERIES = {
  week: "(min-width: 48rem)",
} as const;
