import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Goals · SoleUp" };

/** Placeholder until Phase 1 builds goals; Life areas already exist. */
export default function GoalsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
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
      title="No goals yet"
      description="Goals are coming soon. You'll be able to say what you want to achieve, why it matters, and break it into milestones. Meanwhile, set up the life areas your goals will belong to."
      action={
        <Link
          href="/goals/areas"
          className={buttonClass({ variant: "secondary" })}
        >
          Life areas
        </Link>
      }
    />
  );
}
