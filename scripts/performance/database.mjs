import { existsSync } from "node:fs";

// Shell values win, as in drizzle.config.ts.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export function performanceDatabaseUrl() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Performance tools are development-only.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  if (!URL.canParse(connectionString)) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  const url = new URL(connectionString);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_]+_perf$/.test(url.pathname)
  ) {
    throw new Error("Use a local database whose name ends in _perf.");
  }
  return connectionString;
}
