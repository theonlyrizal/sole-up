import { Suspense } from "react";

import { requireTestErrorPages } from "../forced-error-gate";
import { ForcedActionError } from "./forced-action-error";

/** TEST-ONLY: a button whose Server Action fails unexpectedly. */
export default function ForcedActionErrorPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Forced errors</h1>
      <Suspense>
        <Gated />
      </Suspense>
    </main>
  );
}

async function Gated() {
  await requireTestErrorPages();
  return <ForcedActionError />;
}
