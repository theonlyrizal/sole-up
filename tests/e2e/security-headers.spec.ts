import { expect, test } from "@playwright/test";

test("HTML scripts use a fresh CSP nonce on every response", async ({
  page,
}) => {
  async function checkDocument(path: string) {
    const response = (await page.goto(path))!;
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["cache-control"]).toContain("no-store");

    const policy = headers["content-security-policy"];
    const scriptPolicy = policy
      .split("; ")
      .find((rule) => rule.startsWith("script-src "));
    const nonce = scriptPolicy?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
    const inlineNonces = await page
      .locator("script:not([src])")
      .evaluateAll((scripts) =>
        scripts
          .filter((script) => script.textContent?.trim())
          .map((script) => (script as HTMLScriptElement).nonce),
      );
    expect(inlineNonces.length).toBeGreaterThan(0);
    expect([...new Set(inlineNonces)]).toEqual([nonce]);
    return nonce;
  }

  const firstNonce = await checkDocument("/privacy");
  expect(await checkDocument("/privacy")).not.toBe(firstNonce);
  await checkDocument("/missing.html");
});
