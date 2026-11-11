/** Joins class names, skipping falsy values. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Three-pixel focus outline with a two-pixel gap on neutral surfaces. */
export const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2";

/** Adds an inner stroke in the control's paired foreground color. */
export const filledFocusRing = cx(focusRing, "focus-ring-filled");
