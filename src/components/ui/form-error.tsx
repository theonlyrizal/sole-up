import type { ActionError } from "@/lib/result";

/** A failed action's message that doesn't belong to one field. */
export function FormError({ error }: { error: ActionError | null }) {
  if (!error) return null;
  const message =
    error.code === "VALIDATION"
      ? error.formErrors.join(" ") || null
      : error.message;
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}
