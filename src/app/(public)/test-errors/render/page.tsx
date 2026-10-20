import { Suspense } from "react";

import { requireTestErrorPages } from "../forced-error-gate";

/** TEST-ONLY: throws while rendering, so the root error.tsx shows. */
export default function ForcedRenderErrorPage() {
  return (
    <Suspense>
      <ThrowWhileRendering />
    </Suspense>
  );
}

async function ThrowWhileRendering(): Promise<React.ReactNode> {
  await requireTestErrorPages();
  throw new Error("Forced test error: private note text");
}
