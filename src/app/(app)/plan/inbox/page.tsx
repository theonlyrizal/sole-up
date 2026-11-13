import type { Metadata } from "next";
import { Suspense } from "react";

import { InboxView } from "@/components/tasks/inbox-view";
import { PageFrame } from "@/components/shell/page-frame";
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
    <Suspense
      fallback={
        <PageFrame title="Inbox">
          <LoadingState label="Loading your inbox" />
        </PageFrame>
      }
    >
      <Inbox />
    </Suspense>
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
