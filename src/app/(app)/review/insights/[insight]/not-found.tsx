import Link from "next/link";

import { buttonClass } from "@/components/ui/button";

export default function InsightNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Insight not found
      </h1>
      <p className="text-muted">
        This insight or its date range is unavailable.
      </p>
      <Link
        href="/review/insights"
        className={buttonClass({ className: "self-start" })}
      >
        Back to Insights
      </Link>
    </div>
  );
}
