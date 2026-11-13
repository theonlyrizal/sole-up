import { PageFrame } from "@/components/shell/page-frame";
import { PlanTabs } from "@/components/shell/plan-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function TodaySkeleton() {
  return (
    <PageFrame title="Today" subnav={<PlanTabs />}>
      <div role="status" className="grid min-w-0 gap-6">
        <span className="sr-only">Loading today…</span>
        <div className="grid gap-3">
          <Skeleton className="h-7 w-52 max-w-full" />
          <div className="flex gap-0.5 overflow-hidden p-1 medium:gap-2 large:hidden">
            {Array.from({ length: 7 }, (_, day) => (
              <Skeleton
                key={day}
                shape="circle"
                className="h-19 w-12 shrink-0 medium:h-21 medium:w-14"
              />
            ))}
          </div>
        </div>
        <div className="grid gap-6 large:grid-cols-12 large:items-start">
          <Skeleton
            shape="card"
            className="h-36 large:col-span-5 large:col-start-8 large:row-start-1"
          />
          <div className="grid gap-2 large:col-span-7 large:col-start-1 large:row-start-1">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-44" />
            <Skeleton shape="list-item" className="h-18" />
            <Skeleton shape="list-item" className="h-18" />
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
