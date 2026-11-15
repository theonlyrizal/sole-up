import type { Metadata } from "next";
import { Suspense } from "react";

import { LifeAreasManager } from "@/components/life-areas/life-areas-manager";
import { PageFrame } from "@/components/shell/page-frame";
import { LoadingState } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getLifeAreasView } from "@/server/modules/life-areas/queries";

export const metadata: Metadata = { title: "Life areas · SoleUp" };

export default function LifeAreasPage() {
  return (
    <Suspense
      fallback={
        <PageFrame
          title="Life areas"
          width="detail"
          back={{ href: "/goals", label: "Goals" }}
        >
          <LoadingState label="Loading life areas" />
        </PageFrame>
      }
    >
      <LifeAreas />
    </Suspense>
  );
}

async function LifeAreas() {
  const user = await requireUser();
  const view = await getLifeAreasView(user.id);
  return <LifeAreasManager view={view} />;
}
