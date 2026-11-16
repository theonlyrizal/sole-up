"use client";

import {
  RouteErrorState,
  type RouteErrorProps,
} from "@/components/ui/route-error-state";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/shell/page-container";
import { TopAppBar } from "@/components/shell/top-app-bar";

/**
 * Keeps the shell when Home fails to load. Fixed text only, plus the
 * error's reference (see src/app/error.tsx).
 */
export default function HomeError(props: RouteErrorProps) {
  return (
    <div className="app-header-wash relative">
      <TopAppBar title="Home" />
      <PageContainer width="reading">
        <Card as="div" padding="l">
          <RouteErrorState {...props} title="Home couldn't load" />
        </Card>
      </PageContainer>
    </div>
  );
}
