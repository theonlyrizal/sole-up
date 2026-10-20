import {
  DEFAULT_ERROR_MESSAGES,
  type ActionError,
  type FieldErrors,
} from "@/lib/result";

/**
 * Expected domain failures. Services throw these; authedAction() turns them
 * into an ActionError for the UI. Anything else thrown is treated as
 * unexpected and shown only as a generic message.
 *
 * A message passed here is shown to the user, so it must be fixed text:
 * never interpolate titles, notes or other user content into it.
 */
export abstract class DomainError extends Error {
  abstract toActionError(): ActionError;
}

/**
 * The record does not exist **or** belongs to another user. Services use
 * this one error for both, so a caller can't probe for other users' IDs.
 */
export class NotFoundError extends DomainError {
  override readonly name = "NotFoundError";

  constructor(message: string = DEFAULT_ERROR_MESSAGES.NOT_FOUND) {
    super(message);
  }

  toActionError(): ActionError {
    return { code: "NOT_FOUND", message: this.message };
  }
}

/** Input that passed the schema but breaks a domain rule. */
export class ValidationError extends DomainError {
  override readonly name = "ValidationError";

  constructor(
    readonly fieldErrors: FieldErrors = {},
    message: string = DEFAULT_ERROR_MESSAGES.VALIDATION,
    readonly formErrors: string[] = [],
  ) {
    super(message);
  }

  toActionError(): ActionError {
    return {
      code: "VALIDATION",
      message: this.message,
      fieldErrors: this.fieldErrors,
      formErrors: this.formErrors,
    };
  }
}

/** The change clashes with current state, e.g. a duplicate or stale edit. */
export class ConflictError extends DomainError {
  override readonly name = "ConflictError";

  constructor(message: string = DEFAULT_ERROR_MESSAGES.CONFLICT) {
    super(message);
  }

  toActionError(): ActionError {
    return { code: "CONFLICT", message: this.message };
  }
}
