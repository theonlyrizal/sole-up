import { serializeError } from "./serialize-error";

/**
 * Field redaction for every log line (see "Never log" in
 * docs/IMPLEMENTATION_PLAN.md). A field is redacted by its key, at any depth,
 * whatever its value. Keys are compared ignoring case, `-` and `_`, so
 * `Set-Cookie`, `set_cookie` and `setCookie` all match.
 */

export const REDACTED = "[Redacted]";

/** Keys whose values never reach a log line. */
export const REDACTED_KEYS: readonly string[] = [
  // Credentials and sessions
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "password",
  // User content
  "body",
  "content",
  "note",
  "notes",
  "journal",
  "reason",
  "reflection",
  "text",
  // Push subscription keys (Phase 5)
  "keys",
  "p256dh",
];

/** Any key ending in one of these is redacted too (`accessToken`, `clientSecret`). */
export const REDACTED_KEY_SUFFIXES: readonly string[] = ["token", "secret"];

const MAX_DEPTH = 8;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

const redactedKeys = new Set(REDACTED_KEYS.map(normalizeKey));

export function isRedactedKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    redactedKeys.has(normalized) ||
    REDACTED_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns a copy of `value` with redacted keys replaced by "[Redacted]".
 * Plain objects and arrays are copied, errors become serializeError() (their
 * own enumerable fields, such as Drizzle's `params`, would otherwise be
 * printed), and anything else is passed through as is.
 */
export function redactDeep<T>(value: T): T {
  return walk(value, 0, new WeakSet()) as T;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return serializeError(value);
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);

  const result = isArray
    ? value.map((item) => walk(item, depth + 1, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          isRedactedKey(key) ? REDACTED : walk(item, depth + 1, seen),
        ]),
      );
  seen.delete(value);
  return result;
}
