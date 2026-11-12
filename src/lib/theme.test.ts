import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { resolveTheme, THEME_STORAGE_KEY, themeInitScript } from "./theme";

describe("resolveTheme", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", true, "light"],
    ["dark", false, "dark"],
  ] as const)(
    "resolves %s with prefersDark=%s",
    (choice, prefersDark, expected) => {
      expect(resolveTheme(choice, prefersDark)).toBe(expected);
    },
  );
});

describe("themeInitScript", () => {
  it.each([
    ["dark", { theme: "dark" }],
    ["light", { theme: "light" }],
    ["system", { theme: "system" }],
    [null, {}],
    ['</script><script>throw Error("injected")</script>', {}],
  ])("only writes an explicit supported choice (%s)", (choice, expected) => {
    const dataset = {};
    const getItem = vi.fn(() => choice);
    const script = themeInitScript();
    expect(script).not.toContain("<");
    runInNewContext(script, {
      localStorage: { getItem },
      document: { documentElement: { dataset } },
    });
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(dataset).toEqual(expected);
  });

  it("leaves the light default when storage access throws", () => {
    const dataset = {};
    runInNewContext(themeInitScript(), {
      get localStorage() {
        throw new Error("Storage is blocked");
      },
      document: { documentElement: { dataset } },
    });
    expect(dataset).toEqual({});
  });
});
