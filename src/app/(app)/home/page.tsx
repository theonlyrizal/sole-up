import type { Metadata } from "next";
import { Suspense } from "react";

import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Home · SoleUp" };

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      <Suspense fallback={null}>
        <Greeting />
      </Suspense>
    </main>
  );
}

async function Greeting() {
  const user = await requireUser();
  return (
    <p className="text-muted">
      You&apos;re signed in as {user.email}. Goals and Today arrive in the next
      chunks.
    </p>
  );
}
