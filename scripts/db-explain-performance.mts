/** Run the app's read models through Vite's existing TypeScript/alias support. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createServer } from "vite";

import { performanceDatabaseUrl } from "./performance/database.mjs";

performanceDatabaseUrl();
const { values } = parseArgs({
  options: { out: { type: "string" }, "as-of": { type: "string" } },
});
if (!values.out) throw new Error("Use --out=path/to/plans.json.");
const asOf = values["as-of"] ?? new Date().toISOString().slice(0, 10);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
  Number.isNaN(Date.parse(asOf)) ||
  new Date(asOf).toISOString().slice(0, 10) !== asOf
) {
  throw new Error("Use --as-of=YYYY-MM-DD.");
}
const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, watch: null, ws: false },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("../node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
try {
  const workload = await server.ssrLoadModule(
    "/scripts/performance/workload.ts",
  );
  const report = await workload.measure(asOf);
  const output = resolve(values.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Recorded ${report.queries.length} query plans in ${output}`);
} finally {
  await server.close();
}
