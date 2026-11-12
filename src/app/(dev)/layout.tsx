import type { ReactNode } from "react";

export default function DevLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="min-h-dvh bg-canvas text-on-surface">
      {children}
    </div>
  );
}
