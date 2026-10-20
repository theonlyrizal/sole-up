import { LoadingState } from "@/components/ui/skeleton";

export default function RootLoading() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10"
    >
      <LoadingState />
    </main>
  );
}
