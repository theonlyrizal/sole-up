import { cx } from "./cx";

/** Shared look for native controls and existing standalone editors. */
export function fieldClass(className?: string) {
  return cx("field-control w-full min-w-0 text-body-large", className);
}
