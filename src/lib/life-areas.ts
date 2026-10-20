// Life area constants shared by the server (schema, validation, audit) and
// the UI. Pure: no server-only imports.

export const LIFE_AREA_STATUSES = ["active", "archived"] as const;
export type LifeAreaStatus = (typeof LIFE_AREA_STATUSES)[number];

export const LIFE_AREA_NAME_MAX = 60;
export const LIFE_AREA_DESCRIPTION_MAX = 500;

/** Presentation only. Stored as the key, never as a raw color value. */
export const LIFE_AREA_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type LifeAreaColor = (typeof LIFE_AREA_COLORS)[number];

/** Suggestions offered once to a user with no areas (PRODUCT_SPEC §3). */
export const STARTER_LIFE_AREAS = [
  "Learning",
  "Career",
  "Health",
  "Relationships",
  "Home",
  "Finance",
] as const;
export type StarterLifeArea = (typeof STARTER_LIFE_AREAS)[number];

/** What the UI receives for one area. */
export type LifeArea = {
  id: string;
  name: string;
  description: string | null;
  color: LifeAreaColor | null;
  sortOrder: number;
  status: LifeAreaStatus;
};
