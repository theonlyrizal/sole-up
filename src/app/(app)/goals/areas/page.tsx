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
    <PageFrame
      title="Life areas"
      width="detail"
      back={{ href: "/goals", label: "Goals" }}
      description={
        "The broad parts of your life, like Health or Career. Order them however you like."
      }
    >
      <Suspense fallback={<LoadingState label="Loading life areas" />}>
        <LifeAreas />
      </Suspense>
    </PageFrame>
  );
}

async function LifeAreas() {
  const user = await requireUser();
  const view = await getLifeAreasView(user.id);
  return <LifeAreasManager view={view} />;
}
