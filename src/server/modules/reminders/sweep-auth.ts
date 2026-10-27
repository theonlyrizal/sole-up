import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a sweep request carries `Authorization: Bearer <secret>`.
 *
 * Both sides are hashed before the constant-time comparison, so neither the
 * secret's content nor its length leaks through timing. A missing header, a
 * different scheme and a wrong secret all return false alike.
 */
export function hasSweepSecret(headers: Headers, secret: string): boolean {
  const match = /^Bearer +(\S+) *$/i.exec(headers.get("authorization") ?? "");
  // Hash something even without a token, so every request costs the same.
  const presented = match?.[1] ?? "";
  const equal = timingSafeEqual(digest(presented), digest(secret));
  return match !== null && equal;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
