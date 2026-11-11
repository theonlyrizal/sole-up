import { readFileSync } from "node:fs";

// DESIGN_SYSTEM §1 is the specification. Read its tables directly so the
// contrast report can be recalculated when a documented value changes.
const spec = readFileSync(
  new URL("../docs/ui/DESIGN_SYSTEM.md", import.meta.url),
  "utf8",
);

function rowsBetween(start: string, end: string): string[][] {
  const from = spec.indexOf(start);
  const to = spec.indexOf(end, from + start.length);
  if (from === -1 || to === -1)
    throw new Error(`Missing palette section: ${start}`);
  return spec
    .slice(from, to)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("|---"))
    .slice(1)
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll("`", "")),
    );
}

type Swatches = { light: string; dark: string };
const roles = new Map<string, Swatches>();
for (const [role, light, dark] of rowsBetween(
  "### 1.2 Roles",
  "### 1.3 Life areas",
)) {
  roles.set(role!, { light: light!, dark: dark! });
}
roles.set("resting-surface", {
  light: roles.get("surface-container-lowest")!.light,
  dark: roles.get("surface-container-low")!.dark,
});

function luminance(hex: string): number {
  const channels = hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!channels) throw new Error(`Invalid documented color: ${hex}`);
  const linear = channels.slice(1).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function reportPair(
  foreground: Swatches,
  background: Swatches,
  needed: number,
) {
  const light = contrast(foreground.light, background.light);
  const dark = contrast(foreground.dark, background.dark);
  if (light < needed || dark < needed) process.exitCode = 1;
  return {
    lightPair: `${foreground.light} / ${background.light}`,
    darkPair: `${foreground.dark} / ${background.dark}`,
    light: light.toFixed(2),
    dark: dark.toFixed(2),
    needed,
    result: light >= needed && dark >= needed ? "pass" : "FAIL",
  };
}

console.log("Fixed SoleUp swatches");
console.table(
  Object.fromEntries(
    rowsBetween("### 1.1 Brand palette", "### 1.2 Roles").map(([name, hex]) => [
      name,
      { hex },
    ]),
  ),
);

console.log(
  "Role pairs (foreground / background) and calculated WCAG contrast",
);
console.table(
  Object.fromEntries(
    rowsBetween("### 1.4 Measured contrast", "### 1.5 Patterns").map(
      ([pair, , , needed]) => {
        const [foreground, background] = pair!.split(" / ").map((role) => {
          const swatches = roles.get(role);
          if (!swatches)
            throw new Error(`Unknown role in contrast table: ${role}`);
          return swatches;
        });
        return [pair, reportPair(foreground!, background!, Number(needed))];
      },
    ),
  ),
);

console.log("Life-area text and dot contrast against their containers");
console.table(
  Object.fromEntries(
    rowsBetween("### 1.3 Life areas", "### 1.4 Measured contrast").flatMap(
      ([name, light, dark, dot]) => {
        const [lightContainer, lightOn] = light!.split(" / ");
        const [darkContainer, darkOn] = dark!.split(" / ");
        const [lightDot, darkDot] = dot!.split(" / ");
        const background = { light: lightContainer!, dark: darkContainer! };
        return [
          [
            `${name} text`,
            reportPair({ light: lightOn!, dark: darkOn! }, background, 4.5),
          ],
          [
            `${name} dot`,
            reportPair({ light: lightDot!, dark: darkDot! }, background, 3),
          ],
        ];
      },
    ),
  ),
);
