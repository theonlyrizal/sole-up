import { z } from "zod";

import { isLocalDate } from "@/lib/dates";
import {
  INSIGHT_KEYS,
  insightPeriodFromStart,
  TASK_INSIGHT_KEYS,
} from "@/lib/insights";

const start = z
  .string()
  .refine((value) => isLocalDate(value) && value >= "0001-01-01", {
    abort: true,
  });

export const dismissInsightSchema = z.strictObject({
  key: z.enum(INSIGHT_KEYS),
  start,
});

export const taskInsightPeriodSchema = z
  .object({
    key: z.enum(TASK_INSIGHT_KEYS),
    start,
  })
  .refine(({ key, start }) =>
    isLocalDate(insightPeriodFromStart(key, start).end),
  );
