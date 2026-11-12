"use client";

import { useTransition } from "react";

import { ErrorReference, errorDigest } from "@/components/ui/error-reference";
import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/shell/page-container";
import { TopAppBar } from "@/components/shell/top-app-bar";

/**
 * Keeps the shell when Home fails to load. Fixed text only, plus the
 * error's reference (see src/app/error.tsx).
 */
export default function HomeError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const [retrying, startRetry] = useTransition();
  return (
    <div className="app-header-wash relative">
      <TopAppBar title="Home" />
      <PageContainer width="reading">
        <Card as="div" padding="l">
          <ErrorState
            headingLevel={1}
            title="Home couldn't load"
            description={
              <>
                <p>
                  Your data is safe. Try again, and if it keeps happening,
                  reload the page.
                </p>
                <ErrorReference id={errorDigest(error)} />
              </>
            }
            onRetry={() => startRetry(retry)}
            retrying={retrying}
          />
        </Card>
      </PageContainer>
    </div>
  );
}
