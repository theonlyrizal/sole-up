import { cx, focusRing } from "./cx";

/** Shared look for text inputs, text areas and selects. */
export function fieldClass(className?: string) {
  return cx(
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-fg placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger",
    focusRing,
    className,
  );
}
