import { Suspense } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireUser } from "@/server/auth/session";

/**
 * The authenticated area. Every page under (app) renders only for a signed-in
 * user; anyone else is redirected to /sign-in. Pages and actions must still
 * call requireUser() themselves: a layout is not an authorization boundary.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
      <SignedInShell>{children}</SignedInShell>
    </Suspense>
  );
}

async function SignedInShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <span className="font-semibold">SoleUp</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{user.name}</span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </>
  );
}
