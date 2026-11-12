import type { ActionError } from "@/lib/result";
import { InlineBanner } from "./inline-banner";

/** A failed action's message that doesn't belong to one field. */
export function FormError({ error }: { error: ActionError | null }) {
  if (!error) return null;
  const message =
    error.code === "VALIDATION"
      ? error.formErrors.join(" ") || null
      : error.message;
  return message ? <InlineBanner tone="error">{message}</InlineBanner> : null;
}
