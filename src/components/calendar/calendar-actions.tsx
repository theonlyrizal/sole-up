"use client";

import { Button } from "@/components/ui/button";
import { BlockTimeDialog, type BlockableTask } from "./block-form";
import { EventFormDialog, type EventFormContext } from "./event-dialog";

export function CalendarActions({
  context,
  tasks,
}: {
  context: EventFormContext;
  tasks: BlockableTask[];
}) {
  return (
    <>
      <EventFormDialog
        {...context}
        trigger={<Button size="xs">New event</Button>}
      />
      <BlockTimeDialog
        tasks={tasks}
        timeZone={context.userTimeZone}
        locale={context.locale}
        trigger={
          <Button variant="tonal" size="xs">
            Block time
          </Button>
        }
      />
    </>
  );
}
