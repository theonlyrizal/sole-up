"use server";

import { authedAction } from "@/server/auth/authed-action";

import { search as searchQuery } from "./queries";
import { searchSchema } from "./validation";

// Auth → validate → query (scoped to the user). Search runs as a Server
// Action, a POST, so the terms never go into a URL, the browser's history
// or the host's request logs (ADR 0016), and they are never logged here.

/** The search page's query: notes, goals and tasks, grouped. */
export const search = authedAction(
  searchSchema,
  async ({ query }, { userId }) => searchQuery(userId, query),
);
