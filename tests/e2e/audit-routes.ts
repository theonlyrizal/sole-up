import { seedInsightEvidence } from "./insight-evidence";
import { seedVisualData } from "./visual-data";

import type { Page } from "@playwright/test";

export const auditThemes = ["light", "dark"] as const;
export const phone = { width: 390, height: 844 };
export const desktop = { width: 1280, height: 800 };

/** All authenticated pages, including the routes added since UI_AUDIT. */
export async function seedAuditRoutes(page: Page) {
  const { userId, goalId, noteId, archivedNoteId, pastReviewId, thisWeek } =
    await seedVisualData(page, {
      plan: true,
      calendar: true,
      goalsUI: true,
      reviewUI: true,
      notesUI: true,
    });
  await seedInsightEvidence(userId);

  return [
    ["home", "/home"],
    ["goals", "/goals"],
    ["goal-detail", `/goals/${goalId}`],
    ["goals-archived", "/goals/archived"],
    ["life-areas", "/goals/areas"],
    ["plan", "/plan"],
    ["today", "/plan/today"],
    ["upcoming", "/plan/upcoming"],
    ["inbox", "/plan/inbox"],
    ["calendar-agenda", "/plan/calendar"],
    ["track", "/track"],
    ["track-archived", "/track/archived"],
    ["notes", "/notes"],
    ["notes-search", "/notes/search"],
    ["note-new", "/notes/new"],
    ["note-detail", `/notes/${noteId}`],
    ["notes-archived", "/notes/archived"],
    ["archived-note", `/notes/${archivedNoteId}`],
    ["notes-tags", "/notes/tags"],
    ["review", "/review"],
    ["review-history", "/review/history"],
    ["review-detail", `/review/history/${pastReviewId}`],
    ["review-insights", "/review/insights"],
    ["insight-detail", `/review/insights/next_week_workload?start=${thisWeek}`],
    ["settings", "/settings"],
    ["delete-account", "/settings/delete-account"],
    ["account", "/account"],
  ] as const;
}
