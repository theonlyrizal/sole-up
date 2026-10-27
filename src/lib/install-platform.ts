/** Which install steps fit a device. */
export type InstallPlatform = "ios" | "android" | "desktop";

/**
 * Guesses the device from the browser's user agent. Only used to point at
 * the matching install steps; every set of steps is always shown. iPadOS
 * reports a Mac user agent, so a "Mac" with a touch screen counts as iOS.
 */
export function installPlatform(
  userAgent: string,
  maxTouchPoints: number,
): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}
