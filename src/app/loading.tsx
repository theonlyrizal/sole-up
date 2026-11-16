import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function RootLoading() {
  return (
    <main id="main" className="grid flex-1 place-items-center p-6">
      <LoadingIndicator label="Loading SoleUp" size={48} />
    </main>
  );
}
