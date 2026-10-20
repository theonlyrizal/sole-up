import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found · SoleUp" };

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16"
    >
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted">
        This page doesn&apos;t exist, or it was moved or deleted.
      </p>
      <Link href="/home" className={buttonClass({ className: "self-start" })}>
        Go to Home
      </Link>
    </main>
  );
}
