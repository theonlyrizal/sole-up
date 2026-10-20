/**
 * What a Server Action returns to the UI. Every message here is safe to show
 * to the user: it never carries user content, SQL, or internal details.
 * Pure types and helpers, importable from client and server code.
 */

export type FieldErrors = Record<string, string[]>;

export type ActionError =
  | { code: "UNAUTHENTICATED"; message: string }
  | { code: "NOT_FOUND"; message: string }
  | {
      code: "VALIDATION";
      message: string;
      /** Messages per field. Nested fields use dotted paths, e.g. `dates.0`. */
      fieldErrors: FieldErrors;
      /** Messages that belong to the input as a whole, not one field. */
      formErrors: string[];
    }
  | { code: "CONFLICT"; message: string }
  | {
      code: "INTERNAL";
      message: string;
      /** The request's ID, also in the server log line for this error. */
      requestId?: string;
    };

export type ActionErrorCode = ActionError["code"];

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError };

export const DEFAULT_ERROR_MESSAGES = {
  UNAUTHENTICATED: "Your session has ended. Please sign in again.",
  NOT_FOUND: "We couldn't find that. It may have been deleted.",
  VALIDATION: "Some of the details need fixing.",
  CONFLICT: "That conflicts with something that already exists.",
  INTERNAL: "Something went wrong. Please try again.",
} as const satisfies Record<ActionErrorCode, string>;

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: ActionError): ActionResult<T> {
  return { ok: false, error };
}

/**
 * The error for an unexpected failure. The message includes the request ID,
 * so every place that shows `error.message` also shows the reference the
 * user can quote.
 */
export function internalError(requestId?: string): ActionError {
  return requestId
    ? {
        code: "INTERNAL",
        message: `${DEFAULT_ERROR_MESSAGES.INTERNAL} Reference: ${requestId}`,
        requestId,
      }
    : { code: "INTERNAL", message: DEFAULT_ERROR_MESSAGES.INTERNAL };
}
