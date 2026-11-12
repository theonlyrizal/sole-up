import { PageContainer } from "@/components/shell/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="app-header-wash min-w-0" role="status">
      <span className="sr-only">Loading home…</span>
      <PageContainer className="grid grid-cols-1 gap-2 max-medium:pt-1 medium:gap-6">
        <div className="flex min-h-16 items-center gap-3">
          <Skeleton shape="circle" className="size-10 medium:hidden" />
          <div className="grid gap-2">
            <Skeleton className="h-6 w-40 medium:h-8 medium:w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex min-w-0 gap-0.5 overflow-hidden p-1 medium:gap-2">
          {Array.from({ length: 7 }, (_, day) => (
            <Skeleton
              key={day}
              shape="circle"
              className="h-19 w-12 shrink-0 medium:h-21 medium:w-14"
            />
          ))}
        </div>
        <div className="grid gap-4 large:grid-cols-12 large:gap-6">
          <div className="grid gap-4 large:col-span-8">
            <Skeleton shape="card" className="h-56" />
            <Skeleton shape="card" className="h-48" />
          </div>
          <div className="hidden gap-4 large:col-span-4 large:grid">
            <Skeleton shape="card" className="h-56" />
            <Skeleton shape="card" className="h-48" />
          </div>
        </div>
        <div className="grid gap-3">
          <Skeleton className="h-6 w-40" />
          <div className="flex gap-2 overflow-hidden expanded:grid expanded:grid-cols-3 expanded:gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                key={index}
                shape="card"
                className="h-48 w-48 shrink-0 expanded:w-auto"
              />
            ))}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
