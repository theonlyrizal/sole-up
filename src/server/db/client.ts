import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/server/env";

import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  soleupPool?: Pool;
};

function createPool(): Pool {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  // An idle client can lose its connection (e.g. Postgres restarts). Without
  // a listener, pg rethrows that error and crashes the process. Log only the
  // message: it never contains query parameters.
  pool.on("error", (error) => {
    console.error("Postgres pool error:", error.message);
  });
  return pool;
}

// Reuse one pool across dev hot reloads instead of leaking a new one each time.
const pool = globalForDb.soleupPool ?? createPool();
if (env.NODE_ENV !== "production") globalForDb.soleupPool = pool;

/**
 * The app's pooled database handle. Server-only: importing it from client
 * code fails the build.
 */
export const db = drizzle({
  client: pool,
  schema,
  // camelCase keys in TypeScript, snake_case columns in Postgres. Must match
  // `casing` in drizzle.config.ts.
  casing: "snake_case",
});

export type Db = typeof db;
