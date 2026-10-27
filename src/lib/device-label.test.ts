import { describe, expect, it } from "vitest";

import { deviceLabel } from "./device-label";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

describe("deviceLabel", () => {
  it.each([
    [UA.chromeWindows, "Chrome on Windows"],
    [UA.edgeWindows, "Edge on Windows"],
    [UA.chromeAndroid, "Chrome on Android"],
    [UA.samsungAndroid, "Samsung Internet on Android"],
    [UA.firefoxLinux, "Firefox on Linux"],
    [UA.safariIphone, "Safari on iPhone"],
    [UA.safariMac, "Safari on Mac"],
    [UA.operaMac, "Opera on Mac"],
    [UA.chromeOs, "Chrome on ChromeOS"],
  ])("labels %s", (userAgent, label) => {
    expect(deviceLabel(userAgent)).toBe(label);
  });

  it("calls a Mac with a touch screen an iPad", () => {
    expect(deviceLabel(UA.safariMac, 5)).toBe("Safari on iPad");
  });

  it("falls back when the browser or system is unknown", () => {
    expect(deviceLabel("SomeBot/1.0 (Windows)")).toBe("Browser on Windows");
    expect(deviceLabel("SomeBot/1.0")).toBe("Unknown browser");
    expect(deviceLabel("")).toBe("Unknown browser");
  });
});
