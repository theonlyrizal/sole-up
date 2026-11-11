import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("@playwright/test/cli"),
    "test",
    "tests/e2e/visual-capture.spec.ts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, SOLEUP_VISUAL: "1" } },
);
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
