import type { Metadata } from "next";
import { NotFoundState } from "@/components/ui/not-found-state";

export const metadata: Metadata = { title: "Page not found · SoleUp" };

export default function NotFound() {
  return (
    <main id="main" className="grid flex-1 place-items-center px-4 py-10">
      <NotFoundState
        description="This page may have moved or been deleted."
        href="/home"
        label="Go to Home"
      />
    </main>
  );
}
