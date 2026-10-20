import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LifeAreasManager } from "@/components/life-areas/life-areas-manager";
import { cx, focusRing } from "@/components/ui/cx";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getLifeAreasView } from "@/server/modules/life-areas/queries";

export const metadata: Metadata = { title: "Life areas · SoleUp" };

export default function LifeAreasPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/goals"
          className={cx(
            "self-start rounded-sm text-sm text-muted underline-offset-2 hover:text-fg hover:underline",
            focusRing,
          )}
        >
          ← Goals
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Life areas</h1>
        <p className="text-muted">
          The broad parts of your life, like Health or Career. Order them
          however you like.
        </p>
      </div>
      <Suspense fallback={<LoadingState label="Loading life areas" />}>
        <LifeAreas />
      </Suspense>
    </div>
  );
}

async function LifeAreas() {
  const user = await requireUser();
  const view = await getLifeAreasView(user.id);
  return <LifeAreasManager view={view} />;
}
