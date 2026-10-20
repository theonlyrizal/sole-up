import "server-only";

import { asc, eq } from "drizzle-orm";

import type { LifeArea } from "@/lib/life-areas";
import { db } from "@/server/db/client";
import { lifeAreas, userPreferences } from "@/server/db/schema";

import { toLifeArea } from "./service";

export type LifeAreasView = {
  active: LifeArea[];
  archived: LifeArea[];
  /** True once: the user has no areas and hasn't answered the offer. */
  offerStarters: boolean;
};

/** Everything the Life Areas page shows, for one user. */
export async function getLifeAreasView(userId: string): Promise<LifeAreasView> {
  const [rows, [preferences]] = await Promise.all([
    db
      .select()
      .from(lifeAreas)
      .where(eq(lifeAreas.userId, userId))
      .orderBy(asc(lifeAreas.sortOrder), asc(lifeAreas.createdAt)),
    db
      .select({ lifeAreaStarters: userPreferences.lifeAreaStarters })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId)),
  ]);

  const areas = rows.map(toLifeArea);
  return {
    active: areas.filter((area) => area.status === "active"),
    archived: areas.filter((area) => area.status === "archived"),
    offerStarters: areas.length === 0 && !preferences?.lifeAreaStarters,
  };
}
