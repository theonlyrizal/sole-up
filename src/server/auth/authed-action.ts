import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import {
  DEFAULT_ERROR_MESSAGES,
  fail,
  internalError,
  ok,
  type ActionResult,
  type FieldErrors,
} from "@/lib/result";
import { DomainError } from "@/server/errors";
import { getRequestId, loggerFor } from "@/server/logging/request";

import { getCurrentUser } from "./session";

export type ActionContext = { userId: string };

export type AuthedActionHandler<Input, Output> = (
  input: Input,
  context: ActionContext,
) => Promise<Output>;

/** Resolves the signed-in user's ID for the current request, or `null`. */
export type UserIdResolver = () => Promise<string | null>;

/**
 * Builds authedAction() around a way to find the current user. The app uses
 * the session cookie (below); tests can pass their own resolver.
 */
export function createAuthedAction(resolveUserId: UserIdResolver) {
  return function authedAction<Schema extends z.ZodType, Output>(
    schema: Schema,
    handler: AuthedActionHandler<z.output<Schema>, Output>,
  ): (input: z.input<Schema>) => Promise<ActionResult<Output>> {
    return async (input) => {
      try {
        // 1. Authenticate. Nothing else runs for an anonymous caller, not
        //    even validation, so the action reveals nothing about its input.
        const userId = await resolveUserId();
        if (!userId) {
          return fail({
            code: "UNAUTHENTICATED",
            message: DEFAULT_ERROR_MESSAGES.UNAUTHENTICATED,
          });
        }

        // 2. Validate. Server Action arguments are untrusted, whatever the
        //    TypeScript signature says.
        const parsed = await schema.safeParseAsync(input);
        if (!parsed.success) {
          return fail({
            code: "VALIDATION",
            message: DEFAULT_ERROR_MESSAGES.VALIDATION,
            ...issuesToErrors(parsed.error.issues),
          });
        }

        // 3. Run, then map expected failures to user-safe errors.
        return ok(await handler(parsed.data, { userId }));
      } catch (error) {
        // Let Next.js redirect()/notFound() calls through.
        unstable_rethrow(error);
        if (error instanceof DomainError) return fail(error.toActionError());
        // The log line and the user's message share the request ID.
        const requestId = await getRequestId();
        loggerFor(requestId).error(
          { err: error, source: "action" },
          "Unexpected error in a Server Action",
        );
        return fail(internalError(requestId));
      }
    };
  };
}

/**
 * Wraps a Server Action: authenticates the caller, validates the input with
 * `schema`, runs `handler` with the parsed input and `{ userId }`, and maps
 * errors to an ActionResult. The handler must still pass `userId` to every
 * service call; this wrapper does not scope queries by itself.
 */
export const authedAction = createAuthedAction(
  async () => (await getCurrentUser())?.id ?? null,
);

function issuesToErrors(issues: readonly z.core.$ZodIssue[]): {
  fieldErrors: FieldErrors;
  formErrors: string[];
} {
  const fieldErrors: FieldErrors = {};
  const formErrors: string[] = [];
  for (const issue of issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const key = issue.path.map(String).join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { fieldErrors, formErrors };
}
