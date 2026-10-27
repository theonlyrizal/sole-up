import { installPlatform } from "./install-platform";

/**
 * A short, human label for a browser, such as "Chrome on Android", so the
 * device list in Settings is recognisable. Only this label is stored, never
 * the raw user agent. Order matters: Edge, Opera and Samsung Internet also
 * say "Chrome", and every Chromium browser also says "Safari".
 */
const BROWSERS: [name: string, pattern: RegExp][] = [
  ["Edge", /Edg(e|A|iOS)?\//],
  ["Opera", /OPR\/|OPT\//],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\/|Chromium\//],
  ["Safari", /Version\/[\d.]+.*Safari\//],
];

const SYSTEMS: [name: string, pattern: RegExp][] = [
  ["iPhone", /iPhone|iPod/],
  ["iPad", /iPad/],
  ["Android", /Android/],
  ["ChromeOS", /CrOS/],
  ["Windows", /Windows/],
  ["Mac", /Macintosh|Mac OS X/],
  ["Linux", /Linux/],
];

function match(list: [string, RegExp][], userAgent: string): string | null {
  return list.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;
}

export function deviceLabel(userAgent: string, maxTouchPoints = 0): string {
  const browser = match(BROWSERS, userAgent);
  let system = match(SYSTEMS, userAgent);
  // iPadOS reports a Mac user agent; a touch screen gives it away.
  if (system === "Mac" && installPlatform(userAgent, maxTouchPoints) === "ios")
    system = "iPad";
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return `Browser on ${system}`;
  return "Unknown browser";
}
