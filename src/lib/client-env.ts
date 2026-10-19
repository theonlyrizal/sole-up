import { z } from "zod";

/**
 * Public (browser-visible) environment variables. Only `NEXT_PUBLIC_*`
 * variables belong here, and never a secret: Next.js inlines them into the
 * client bundle at build time.
 *
 * Next.js only inlines static references, so read each variable as
 * `process.env.NEXT_PUBLIC_X` in `readClientEnv`, never through a dynamic key.
 *
 * There are no public variables yet. The server validates this schema at
 * startup together with its own (see `src/server/env.ts`).
 */
export const clientEnvSchema = z.object({});

export function readClientEnv(): Record<
  keyof z.infer<typeof clientEnvSchema>,
  string | undefined
> {
  return {};
}

export const clientEnv = clientEnvSchema.parse(readClientEnv());
