/**
 * Every request gets an ID in the proxy (src/proxy.ts), passed on as this
 * header. Server code logs it, and users see it next to a generic error
 * message so a report can be matched to the log line. Pure, so the proxy and
 * client code can import it.
 */
export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return crypto.randomUUID();
}

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True for an ID made by newRequestId(). Anything else is not trusted. */
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}
