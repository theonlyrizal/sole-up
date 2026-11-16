import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageFrame } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { LoadingState } from "@/components/ui/skeleton";
import {
  ACCOUNT_RECOVERY_DAYS,
  DELETE_ACCOUNT_PATH,
} from "@/lib/account-deletion";
import { PROVIDERS } from "@/server/auth/providers";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { accounts } from "@/server/db/schema";

export const metadata: Metadata = { title: "Account · SoleUp" };

export default function AccountPage() {
  return (
    <PageFrame title="Account" width="reading">
      <Suspense fallback={<LoadingState label="Loading account" />}>
        <AccountDetails />
      </Suspense>
    </PageFrame>
  );
}

async function AccountDetails() {
  const user = await requireUser();
  const linked = await db
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, user.id));
  const providers = PROVIDERS.filter(({ id }) =>
    linked.some(({ providerId }) => providerId === id),
  );

  return (
    <div className="grid min-w-0 gap-4">
      <Card headingId="profile-heading" className="grid gap-4">
        <CardHeader title="Profile" id="profile-heading" icon="person" />
        <div className="flex items-center gap-4">
          <ShapeAvatar
            id={user.id}
            entityType="user"
            label={user.name}
            size={56}
          />
          <dl className="grid min-w-0 gap-2 wrap-anywhere">
            <div>
              <dt className="sr-only">Name</dt>
              <dd className="text-title-large">{user.name}</dd>
            </div>
            <div>
              <dt className="sr-only">Email address</dt>
              <dd className="text-body-medium text-on-surface-variant">
                {user.email}
              </dd>
            </div>
          </dl>
        </div>
        <div className="grid gap-1 border-t border-outline-variant pt-4">
          <h3 className="text-title-medium">Sign-in providers</h3>
          <p className="text-body-medium text-on-surface-variant">
            {providers.length
              ? providers.map(({ label }) => label).join(", ")
              : "No sign-in providers are linked."}
          </p>
        </div>
      </Card>
      <Card headingId="data-heading" className="grid gap-3">
        <CardHeader title="Data and privacy" id="data-heading" icon="lock" />
        <p className="text-body-medium text-on-surface-variant">
          Download your SoleUp data as a JSON file, including a Markdown copy of
          each note. The file contains personal data, so store it somewhere
          private.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/export"
            className={buttonClass({ variant: "secondary" })}
          >
            Download export
          </a>
          <Link href="/privacy" className={buttonClass({ variant: "text" })}>
            Privacy notes
          </Link>
        </div>
      </Card>
      <Card
        headingId="session-heading"
        className="grid justify-items-start gap-3"
      >
        <CardHeader title="Session" id="session-heading" />
        <SignOutButton buttonTone="tonal" />
      </Card>
      <Card
        headingId="delete-heading"
        className="grid justify-items-start gap-3 border border-error"
      >
        <CardHeader title="Delete account" id="delete-heading" />
        <p className="text-body-medium text-on-surface-variant">
          Close your account with a {ACCOUNT_RECOVERY_DAYS}-day reactivation
          period.
        </p>
        <Link
          href={DELETE_ACCOUNT_PATH}
          className={buttonClass({ variant: "danger" })}
        >
          Delete account
        </Link>
      </Card>
    </div>
  );
}
