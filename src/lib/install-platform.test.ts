import { describe, expect, it } from "vitest";

import { installPlatform } from "./install-platform";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const CHROME_ON_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("installPlatform", () => {
  it("recognises iPhones, including other browsers on iOS", () => {
    expect(installPlatform(IPHONE, 5)).toBe("ios");
    expect(installPlatform(CHROME_ON_IOS, 5)).toBe("ios");
  });

  it("treats a Mac user agent with a touch screen as an iPad", () => {
    expect(installPlatform(IPAD_DESKTOP_MODE, 5)).toBe("ios");
  });

  it("keeps a Mac without touch as a computer", () => {
    expect(installPlatform(IPAD_DESKTOP_MODE, 0)).toBe("desktop");
  });

  it("recognises Android", () => {
    expect(installPlatform(ANDROID, 5)).toBe("android");
  });

  it("falls back to a computer", () => {
    expect(installPlatform(WINDOWS, 0)).toBe("desktop");
    expect(installPlatform("", 0)).toBe("desktop");
  });
});
