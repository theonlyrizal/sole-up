import { z } from "zod";

import {
  LIFE_AREA_COLORS,
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_NAME_MAX,
  STARTER_LIFE_AREAS,
} from "@/lib/life-areas";

const idSchema = z.uuid("Choose an area.");

const nameSchema = z
  .string({ error: "Give the area a name." })
  .trim()
  .min(1, "Give the area a name.")
  .max(
    LIFE_AREA_NAME_MAX,
    `Keep the name to ${LIFE_AREA_NAME_MAX} characters or fewer.`,
  );

/** Optional text: blank becomes null. */
const descriptionSchema = z
  .string()
  .trim()
  .max(
    LIFE_AREA_DESCRIPTION_MAX,
    `Keep the description to ${LIFE_AREA_DESCRIPTION_MAX} characters or fewer.`,
  )
  .nullish()
  .transform((value) => value || null);

const colorSchema = z
  .enum(LIFE_AREA_COLORS, { error: "Choose a color from the list." })
  .nullish()
  .transform((value) => value ?? null);

function unique<T>(values: T[]) {
  return new Set(values).size === values.length;
}

export const createLifeAreaSchema = z.strictObject({
  name: nameSchema,
  description: descriptionSchema,
  color: colorSchema,
});
export type CreateLifeAreaInput = z.output<typeof createLifeAreaSchema>;

export const updateLifeAreaSchema = createLifeAreaSchema.extend({
  id: idSchema,
});
export type UpdateLifeAreaInput = z.output<typeof updateLifeAreaSchema>;

/** Archive, unarchive and delete name one area. */
export const lifeAreaIdSchema = z.strictObject({ id: idSchema });
export type LifeAreaIdInput = z.output<typeof lifeAreaIdSchema>;

/** Every active area's ID, in the new order. */
export const reorderLifeAreasSchema = z.strictObject({
  ids: z
    .array(idSchema)
    .min(1)
    .max(500)
    .refine(unique, "Each area can appear only once."),
});
export type ReorderLifeAreasInput = z.output<typeof reorderLifeAreasSchema>;

export const addStarterLifeAreasSchema = z.strictObject({
  names: z
    .array(z.enum(STARTER_LIFE_AREAS))
    .min(1, "Choose at least one area.")
    .refine(unique, "Each area can appear only once."),
});
export type AddStarterLifeAreasInput = z.output<
  typeof addStarterLifeAreasSchema
>;

export const dismissStarterLifeAreasSchema = z.strictObject({});
