import type { Metadata } from "next";
import { Suspense } from "react";

import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Plan · SoleUp" };

/** Placeholder until Phase 2 builds tasks, Today and Upcoming. */
export default function PlanPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
      <PlanSubnav />
      <Suspense fallback={null}>
        <Placeholder />
      </Suspense>
    </div>
  );
}

async function Placeholder() {
  await requireUser();
  return (
    <EmptyState
      title="Nothing planned yet"
      description="Today and Upcoming are coming soon. Capture a task with Add task or the Q key, and find unsorted ones in your inbox."
    />
  );
}
