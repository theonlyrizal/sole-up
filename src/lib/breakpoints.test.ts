import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { BREAKPOINTS, mediaQuery, type Breakpoint } from "./breakpoints";

const css = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const names = Object.keys(BREAKPOINTS) as Breakpoint[];

it.each(names)("uses the same %s boundary for CSS and matchMedia", (name) => {
  const value = css.match(
    new RegExp(`--breakpoint-${name}: ([\\d.]+)rem;`),
  )?.[1];
  expect(Number(value) * 16).toBe(BREAKPOINTS[name]);
  expect(mediaQuery(name)).toBe(`(min-width: ${value}rem)`);
});
