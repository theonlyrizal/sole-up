import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { isRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

import { logger, type Logger } from "./logger";

/**
 * The current request's ID, set by the proxy. `undefined` outside a request
 * (scripts, tests) or when the header is missing or malformed. Call it from
 * Server Actions, route handlers and error paths, not while prerendering:
 * reading headers makes a page dynamic.
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    return requestIdFrom(await headers());
  } catch (error) {
    // Next.js uses errors to signal dynamic rendering; let those through.
    unstable_rethrow(error);
    return undefined;
  }
}

/** Reads the request ID from a request's headers. */
export function requestIdFrom(
  source: Headers | Record<string, string | string[] | undefined>,
): string | undefined {
  const value =
    source instanceof Headers
      ? source.get(REQUEST_ID_HEADER)
      : source[REQUEST_ID_HEADER];
  const id = Array.isArray(value) ? value[0] : value;
  return isRequestId(id) ? id : undefined;
}

/** A logger whose lines carry `requestId` when one is known. */
export function loggerFor(requestId: string | undefined): Logger {
  return requestId ? logger.child({ requestId }) : logger;
}

/** The logger for the current request (see getRequestId). */
export async function getRequestLogger(): Promise<Logger> {
  return loggerFor(await getRequestId());
}

const requestIdStore = new AsyncLocalStorage<string | undefined>();

/**
 * Runs `fn` with `requestId` available to synchronous code that can't read
 * headers, such as Better Auth's logger callback (see currentRequestId).
 */
export function runWithRequestId<T>(
  requestId: string | undefined,
  fn: () => T,
): T {
  return requestIdStore.run(requestId, fn);
}

/** The ID passed to the enclosing runWithRequestId(), if any. */
export function currentRequestId(): string | undefined {
  return requestIdStore.getStore();
}
