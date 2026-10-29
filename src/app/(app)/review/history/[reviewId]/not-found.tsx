import Link from "next/link";

import { buttonClass } from "@/components/ui/button";

/**
 * A review that doesn't exist or isn't the user's. Rendered inside the
 * shell, so the navigation stays.
 */
export default function ReviewNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Review not found
      </h1>
      <p className="text-muted">
        This review doesn&apos;t exist, or it was deleted.
      </p>
      <Link
        href="/review/history"
        className={buttonClass({ className: "self-start" })}
      >
        Back to past reviews
      </Link>
    </div>
  );
}
