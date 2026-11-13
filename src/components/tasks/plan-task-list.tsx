"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { BlockTimeDialog } from "@/components/calendar/block-form";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup } from "@/components/ui/list";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import type {
  PlanTaskItem,
  TaskParentOption,
} from "@/server/modules/tasks/queries";

import { TaskFormDialog } from "./task-form";
import { TaskRow } from "./task-row";
import { TaskScheduleEditor } from "./task-schedule-editor";

export { taskDetails } from "./task-row";

type TaskAction = "edit" | "schedule" | "block";
type OpenTask = (
  kind: TaskAction,
  task: PlanTaskItem,
  origin: HTMLElement,
) => void;
type RowContext = { locale: string; timeZone: string };
const TaskActions = createContext<(RowContext & { openTask: OpenTask }) | null>(
  null,
);

type RowFocus = {
  element: HTMLElement;
  title: HTMLElement;
  list: HTMLElement;
  index: number;
};

export function TaskListScope({
  children,
  locale,
  timeZone,
  parentOptions,
  fallbackId,
}: RowContext & {
  children: React.ReactNode;
  parentOptions?: TaskParentOption[];
  fallbackId?: string;
}) {
  const pane = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<RowFocus | null>(null);
  const [overlay, setOverlay] = useState<{
    kind: TaskAction;
    task: PlanTaskItem;
    focus: RowFocus | null;
  } | null>(null);

  function locate(element: HTMLElement): RowFocus | null {
    const row = element.closest("li");
    const title = row?.querySelector<HTMLElement>("[data-today-task]");
    const list = row?.parentElement;
    return row && title && list
      ? { element, title, list, index: Array.from(list.children).indexOf(row) }
      : null;
  }

  function restore(focus: RowFocus | null) {
    if (!focus || !pane.current) return;
    const { element, title, list, index } = focus;
    const titles = Array.from(
      pane.current.querySelectorAll<HTMLElement>("[data-today-task]"),
    );
    const remaining = list.isConnected
      ? titles.filter((item) => list.contains(item))
      : titles;
    const destination =
      (element.isConnected ? element : undefined) ??
      titles.find(
        (item) => item.dataset.todayTask === title.dataset.todayTask,
      ) ??
      remaining[Math.min(index, remaining.length - 1)] ??
      (fallbackId ? document.getElementById(fallbackId) : null) ??
      pane.current;
    destination.focus();
  }

  useLayoutEffect(() => {
    if (
      !overlay &&
      lastFocus.current &&
      !lastFocus.current.element.isConnected &&
      document.activeElement === document.body
    ) {
      restore(lastFocus.current);
    }
  });

  function openTask(kind: TaskAction, task: PlanTaskItem, origin: HTMLElement) {
    setOverlay({ kind, task, focus: locate(origin) });
  }

  const dialog = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) setOverlay(null);
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      restore(overlay?.focus ?? null);
    },
  };

  return (
    <TaskActions.Provider value={{ locale, timeZone, openTask }}>
      <div
        ref={pane}
        tabIndex={-1}
        className="grid min-w-0 gap-6"
        onFocusCapture={(event) => {
          if (pane.current?.contains(event.target))
            lastFocus.current = locate(event.target);
        }}
      >
        {children}
      </div>
      {overlay?.kind === "edit" && (
        <TaskFormDialog
          {...dialog}
          task={overlay.task}
          timeZone={timeZone}
          parentOptions={parentOptions}
        />
      )}
      {overlay?.kind === "schedule" && parentOptions && (
        <TaskScheduleEditor
          {...dialog}
          task={overlay.task}
          parentOptions={parentOptions}
          timeZone={timeZone}
        />
      )}
      {overlay?.kind === "block" && (
        <BlockTimeDialog
          {...dialog}
          task={overlay.task}
          locale={locale}
          timeZone={timeZone}
        />
      )}
    </TaskActions.Provider>
  );
}

export function TaskListRow({
  task,
  schedule = false,
  ...props
}: Pick<
  React.ComponentProps<typeof TaskRow>,
  "selection" | "details" | "showGoal"
> & {
  task: PlanTaskItem;
  schedule?: boolean;
}) {
  const context = useContext(TaskActions);
  const menu = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  if (!context) throw new Error("TaskListRow needs a TaskListScope");
  const { locale, timeZone, openTask } = context;

  function choose(kind: TaskAction) {
    if (!menu.current) return;
    openingDialog.current = true;
    openTask(kind, task, menu.current);
  }

  return (
    <TaskRow
      {...props}
      task={task}
      locale={locale}
      timeZone={timeZone}
      onOpen={(origin) => openTask("edit", task, origin)}
      actions={
        <Menu modal={false}>
          <MenuTrigger asChild>
            <IconButton
              ref={menu}
              icon="more_vert"
              label={`Actions for ${task.title}`}
              tooltip={false}
            />
          </MenuTrigger>
          <MenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (openingDialog.current) event.preventDefault();
              openingDialog.current = false;
            }}
          >
            <MenuItem
              icon="edit"
              aria-label={`Edit: ${task.title}`}
              onSelect={() => choose("edit")}
            >
              Edit task
            </MenuItem>
            {schedule && (
              <MenuItem
                icon="calendar_month"
                aria-label={`Dates and goal: ${task.title}`}
                onSelect={() => choose("schedule")}
              >
                Dates and goal
              </MenuItem>
            )}
            {task.status === "open" && (
              <MenuItem
                icon="schedule"
                aria-label={`Block time: ${task.title}`}
                onSelect={() => choose("block")}
              >
                Block time
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      }
    />
  );
}

export function PlanTaskList({
  tasks,
  label = "Tasks",
  showGoal = true,
  empty,
  ...context
}: RowContext & {
  tasks: PlanTaskItem[];
  parentOptions: TaskParentOption[];
  label?: string;
  showGoal?: boolean;
  empty?: React.ReactNode;
  fallbackId?: string;
}) {
  return (
    <TaskListScope {...context}>
      {tasks.length > 0 ? (
        <ListGroup label={label}>
          {tasks.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              showGoal={showGoal}
              schedule
            />
          ))}
        </ListGroup>
      ) : (
        empty
      )}
    </TaskListScope>
  );
}
