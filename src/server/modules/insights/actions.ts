"use server";

import { refresh } from "next/cache";

import { authedAction } from "@/server/auth/authed-action";

import { dismissInsightForPeriod } from "./service";
import { dismissInsightSchema } from "./validation";

export const dismissInsight = authedAction(
  dismissInsightSchema,
  async (input, { userId }) => {
    await dismissInsightForPeriod(userId, input);
    refresh();
  },
);
