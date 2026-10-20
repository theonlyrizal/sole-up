import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local the way `next dev`
// would. Variables already set in the shell win, which is how you point a
// command at another database (see README > Database and migrations).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local (see README > Local setup).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  dbCredentials: { url },
  // Must match `casing` in src/server/db/client.ts.
  casing: "snake_case",
  strict: true,
  verbose: true,
});
