// Drizzle schema entry point, read by drizzle.config.ts and the db client.
// Each domain module gets its own file in this folder; re-export it here so
// drizzle-kit sees it and relational queries can use it.
export * from "./auth";
export * from "./audit";
export * from "./calendar-events";
export * from "./goals";
export * from "./habits";
export * from "./life-areas";
export * from "./milestones";
export * from "./preferences";
export * from "./push-subscriptions";
export * from "./reminder-sweeps";
export * from "./reminders";
export * from "./tasks";
export * from "./time-blocks";
export * from "./weekly-reviews";
