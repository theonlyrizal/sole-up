/**
 * The test-only sign-in shortcut (src/app/api/test/sign-in/route.ts) lets
 * end-to-end tests get a session without OAuth. It must never be reachable
 * outside tests, so it fails closed: it is on only when NODE_ENV is exactly
 * "test" AND SOLEUP_TEST_SIGN_IN is exactly "1". Anything else, including a
 * missing or malformed value, leaves it off.
 */
export function isTestSignInEnabled(source: {
  NODE_ENV?: string;
  SOLEUP_TEST_SIGN_IN?: string;
}): boolean {
  return source.NODE_ENV === "test" && source.SOLEUP_TEST_SIGN_IN === "1";
}
