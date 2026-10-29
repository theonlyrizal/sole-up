/**
 * Top-level URL segments served by the (app) route group. Route groups don't
 * appear in URLs, so the proxy needs this list to know which requests are
 * for the signed-in area. A unit test fails if a folder under src/app/(app)
 * is missing from it.
 */
export const APP_ROUTE_SEGMENTS = [
  "home",
  "goals",
  "plan",
  "track",
  "review",
  "settings",
] as const;

export const SIGN_IN_PATH = "/sign-in";

/** True for `/home`, `/home/anything`; false for `/homework` or `/`. */
export function isAppPath(pathname: string): boolean {
  return APP_ROUTE_SEGMENTS.some(
    (segment) =>
      pathname === `/${segment}` || pathname.startsWith(`/${segment}/`),
  );
}
