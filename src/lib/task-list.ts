// The Plan page's task list: filters and sorts as they live in the URL,
// date windows and ordering. Pure: no server-only imports, so the page,
// the query and the filter bar share one definition.
// Rules: ADR 0011 (priority order, closed tasks) and chunk 2.4.

import { addDays, type LocalDate, startOfLocalDay } from "./dates";
import { PRIORITIES, type Priority } from "./priorities";
import { type Task, TASK_STATUSES, type TaskStatus } from "./tasks";

export const TASK_SORTS = ["due", "planned", "priority"] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export const TASK_SORT_LABELS: Record<TaskSort, string> = {
  due: "Due date",
  planned: "Planned date",
  priority: "Priority",
};

/**
 * Windows for a planned or due date, relative to the user's today. They
 * don't overlap: "next 7 days" starts tomorrow.
 */
export const TASK_DATE_WINDOWS = [
  "past",
  "today",
  "next7",
  "later",
  "none",
] as const;
export type TaskDateWindow = (typeof TASK_DATE_WINDOWS)[number];

export const PLANNED_WINDOW_LABELS: Record<TaskDateWindow, string> = {
  past: "Before today",
  today: "Today",
  next7: "Next 7 days",
  later: "Later",
  none: "Not planned",
};

export const DUE_WINDOW_LABELS: Record<TaskDateWindow, string> = {
  past: "Before today",
  today: "Today",
  next7: "Next 7 days",
  later: "Later",
  none: "No due date",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** "none" filters for tasks without one (no goal, no priority). */
export type TaskListFilters = {
  goal: string | "none" | null;
  area: string | null;
  priority: Priority | "none" | null;
  planned: TaskDateWindow | null;
  due: TaskDateWindow | null;
  sort: TaskSort;
  /** Completed and cancelled tasks sit behind this toggle. */
  showClosed: boolean;
  /** Only applies while closed tasks are shown; null is every status. */
  status: TaskStatus | null;
};

export const DEFAULT_TASK_LIST_FILTERS: TaskListFilters = {
  goal: null,
  area: null,
  priority: null,
  planned: null,
  due: null,
  sort: "due",
  showClosed: false,
  status: null,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParamValue = string | string[] | undefined;

function single(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | null {
  return values.find((candidate) => candidate === value) ?? null;
}

function idOrNull(value: string | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

/**
 * Filters from the page's search params. Anything unknown or malformed is
 * ignored (falls back to the default), so an edited or stale bookmark still
 * opens the page.
 */
export function parseTaskListFilters(
  params: Record<string, SearchParamValue>,
): TaskListFilters {
  const goal = single(params.goal);
  const priority = single(params.priority);
  const showClosed = single(params.closed) === "1";
  return {
    goal: goal === "none" ? "none" : idOrNull(goal),
    area: idOrNull(single(params.area)),
    priority: priority === "none" ? "none" : oneOf(PRIORITIES, priority),
    planned: oneOf(TASK_DATE_WINDOWS, single(params.planned)),
    due: oneOf(TASK_DATE_WINDOWS, single(params.due)),
    sort: oneOf(TASK_SORTS, single(params.sort)) ?? "due",
    showClosed,
    status: showClosed ? oneOf(TASK_STATUSES, single(params.status)) : null,
  };
}

/**
 * The search string for filters ("" or "?goal=…&sort=planned"), leaving out
 * defaults so the plain page stays `/plan`. Round-trips with
 * `parseTaskListFilters`.
 */
export function taskListSearch(filters: TaskListFilters): string {
  const params = new URLSearchParams();
  if (filters.goal) params.set("goal", filters.goal);
  if (filters.area) params.set("area", filters.area);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.planned) params.set("planned", filters.planned);
  if (filters.due) params.set("due", filters.due);
  if (filters.sort !== DEFAULT_TASK_LIST_FILTERS.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.showClosed) {
    params.set("closed", "1");
    if (filters.status) params.set("status", filters.status);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** True when any filter (not the sort) narrows the list. */
export function hasActiveTaskFilters(filters: TaskListFilters): boolean {
  return Boolean(
    filters.goal ||
    filters.area ||
    filters.priority ||
    filters.planned ||
    filters.due ||
    filters.status,
  );
}

/**
 * The inclusive local-date bounds of a window, for a user whose date is
 * `today`. "none" (no date) has no bounds and is handled by the caller.
 */
export function dateWindowBounds(
  window: Exclude<TaskDateWindow, "none">,
  today: LocalDate,
): { from: LocalDate | null; to: LocalDate | null } {
  switch (window) {
    case "past":
      return { from: null, to: addDays(today, -1) };
    case "today":
      return { from: today, to: today };
    case "next7":
      return { from: addDays(today, 1), to: addDays(today, 7) };
    case "later":
      return { from: addDays(today, 8), to: null };
  }
}

/**
 * A window's bounds as a half-open instant range `[start, end)` in the
 * user's zone, for timed deadlines (`due_at`).
 */
export function dateWindowInstants(
  window: Exclude<TaskDateWindow, "none">,
  today: LocalDate,
  timeZone: string,
): { start: Date | null; end: Date | null } {
  const { from, to } = dateWindowBounds(window, today);
  return {
    start: from ? startOfLocalDay(from, timeZone) : null,
    end: to ? startOfLocalDay(addDays(to, 1), timeZone) : null,
  };
}

type SortableTask = Pick<
  Task,
  | "id"
  | "dueDate"
  | "dueAt"
  | "plannedDate"
  | "priority"
  | "sortOrder"
  | "createdAt"
>;

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Empty values sort after everything else, whatever the direction. */
function compareNullable<T>(
  a: T | null,
  b: T | null,
  compare: (a: T, b: T) => number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

/**
 * When a deadline falls, as epoch ms: a timed one at its instant, an
 * all-day one at the start of that date in the user's zone (so it comes
 * before that day's timed deadlines).
 */
function dueKey(task: SortableTask, timeZone: string): number | null {
  if (task.dueAt) return task.dueAt.getTime();
  if (task.dueDate) return startOfLocalDay(task.dueDate, timeZone).getTime();
  return null;
}

/**
 * A comparator for `sort`: earliest due or planned first, or priority high
 * → low (ADR 0011). Tasks without the sorted value come last. Ties fall
 * back to the deadline, then the task's position and creation.
 */
export function compareTasksBy(
  sort: TaskSort,
  timeZone: string,
): (a: SortableTask, b: SortableTask) => number {
  const byNumber = (x: number, y: number) => x - y;
  const byDue = (a: SortableTask, b: SortableTask) =>
    compareNullable(dueKey(a, timeZone), dueKey(b, timeZone), byNumber);
  const byPosition = (a: SortableTask, b: SortableTask) =>
    a.sortOrder - b.sortOrder ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id.localeCompare(b.id);

  const primary: Record<
    TaskSort,
    (a: SortableTask, b: SortableTask) => number
  > = {
    due: byDue,
    planned: (a, b) =>
      compareNullable(a.plannedDate, b.plannedDate, (x, y) =>
        x.localeCompare(y),
      ),
    priority: (a, b) =>
      compareNullable(a.priority, b.priority, (x, y) =>
        byNumber(PRIORITY_RANK[x], PRIORITY_RANK[y]),
      ),
  };
  return (a, b) => primary[sort](a, b) || byDue(a, b) || byPosition(a, b);
}

/** An estimate for display: "45 min", "1 h" or "1 h 30 min". */
export function formatEstimate(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}
