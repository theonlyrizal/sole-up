"use client";

import { PageFrame } from "@/components/shell/page-frame";
import { PlanTabs } from "@/components/shell/plan-tabs";
import { Card } from "@/components/ui/card";
import {
  RouteErrorState,
  type RouteErrorProps,
} from "@/components/ui/route-error-state";

/**
 * Keeps the shell when Today fails to load. Fixed text only, plus the
 * error's reference (see src/app/error.tsx).
 */
export default function TodayError(props: RouteErrorProps) {
  return (
    <PageFrame title="Today" subnav={<PlanTabs />}>
      <Card as="div" className="mx-auto w-full max-w-2xl">
        <RouteErrorState
          {...props}
          title="Today couldn't load"
          headingLevel={2}
        />
      </Card>
    </PageFrame>
  );
}
