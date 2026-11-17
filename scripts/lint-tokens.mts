import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = new URL("../src/", import.meta.url);
const extensions = new Set([".ts", ".tsx", ".css", ".js", ".jsx"]);
const legacyRoles =
  "bg|surface(?:-muted)?|fg|muted(?:-fg)?|border|accent(?:-fg|-hover)?|danger(?:-fg|-hover)?";
const utility =
  "bg|text|border(?:-[trblxyse])?|divide|ring(?:-offset)?|outline|fill|stroke|shadow|from|via|to|accent|caret|decoration";
const palette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe";

const rules = [
  {
    message: "Use a semantic color role",
    pattern: new RegExp(
      `(?<![\\w-])(?:${utility})-(?:${legacyRoles})(?![\\w-])`,
      "g",
    ),
  },
  {
    message: "Use a type role or a current CSS token",
    pattern:
      /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])|--(?:fs-[\w-]+|corner-(?:sm|md|lg))(?![\w-])/g,
  },
  {
    message: "Use the current semantic CSS token",
    pattern:
      /(?<![\w-])--(?:(?:color-)?(?:bg|surface(?:-muted)?|fg(?:-muted)?|muted|accent(?:-fg|-hover)?|danger(?:-fg|-hover)?|border)|focus|success)(?![\w-])/g,
  },
  {
    message: "Use a SoleUp breakpoint",
    pattern:
      /(?<![\w-])(?:(?:min-|max-)?(?:sm|md|lg|xl|2xl):|--breakpoint-(?:sm|md|lg|xl|2xl)\b)/g,
  },
  {
    message: "Use a semantic color role instead of a Tailwind palette color",
    pattern: new RegExp(
      `(?<![\\w-])(?:${utility})-(?:(?:${palette})-\\d{2,3}|black|white)(?![\\w-])`,
      "g",
    ),
  },
];
const rawHex =
  /(?<![\w&])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/gi;

let failures = 0;
for (const file of await readdir(source, {
  recursive: true,
  withFileTypes: true,
})) {
  const extension = extname(file.name);
  if (!file.isFile() || !extensions.has(extension)) continue;
  const path = `${file.parentPath}/${file.name}`;
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const checks =
    extension === ".tsx"
      ? [
          ...rules,
          {
            message: "Put color values in CSS tokens or assets",
            pattern: rawHex,
          },
        ]
      : rules;
  for (const [lineNumber, line] of lines.entries()) {
    for (const { message, pattern } of checks) {
      for (const match of line.matchAll(pattern)) {
        console.error(
          `${relative(root, path)}:${lineNumber + 1}:${match.index + 1} ${message} (${match[0]})`,
        );
        failures++;
      }
    }
  }
}

if (failures) process.exitCode = 1;
else console.log("Design tokens pass.");
