import "server-only";

import { createHash } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import type { PushDevice } from "@/lib/push";
import { db } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";

/** SHA-256 of an endpoint, base64url. The page hashes its own to match. */
export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("base64url");
}

/** The user's subscribed devices, oldest first, without keys or endpoints. */
export async function listPushDevices(userId: string): Promise<PushDevice[]> {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      label: pushSubscriptions.userAgentLabel,
      createdAt: pushSubscriptions.createdAt,
      lastSuccessAt: pushSubscriptions.lastSuccessAt,
      failedCount: pushSubscriptions.failedCount,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id));
  return rows.map(({ endpoint, ...device }) => ({
    ...device,
    endpointHash: endpointHash(endpoint),
  }));
}
