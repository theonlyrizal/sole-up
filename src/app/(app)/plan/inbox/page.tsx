import type { Metadata } from "next";
import { Suspense } from "react";

import { InboxView } from "@/components/tasks/inbox-view";
import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getUserPreferences } from "@/server/modules/preferences/service";
import {
  listInboxTasks,
  listTaskParentOptions,
} from "@/server/modules/tasks/queries";

export const metadata: Metadata = { title: "Inbox · SoleUp" };

export default function InboxPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-muted">
          Tasks with no goal and no plan yet. Decide when to do them, or put
          them under a goal.
        </p>
      </div>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading your inbox" />}>
        <Inbox />
      </Suspense>
    </div>
  );
}

async function Inbox() {
  const user = await requireUser();
  const [tasks, parentOptions, preferences] = await Promise.all([
    listInboxTasks(user.id),
    listTaskParentOptions(user.id),
    getUserPreferences(user.id),
  ]);
  return (
    <InboxView
      tasks={tasks}
      parentOptions={parentOptions}
      locale={preferences.locale}
      // The shell only renders pages once a zone is confirmed.
      timeZone={preferences.timezone ?? "UTC"}
    />
  );
}
