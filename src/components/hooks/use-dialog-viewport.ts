"use client";

import { useCallback } from "react";

/** Keep compact dialogs inside the visible viewport as the keyboard pans it. */
export function useDialogViewport(enabled: boolean) {
  return useCallback(
    (panel: HTMLDivElement | null) => {
      if (!panel || !enabled || !window.visualViewport) return;
      const viewport = window.visualViewport;
      function update() {
        panel?.style.setProperty(
          "--form-viewport-height",
          viewport.scale === 1 ? `${viewport.height}px` : "100dvh",
        );
        panel?.style.setProperty(
          "--form-viewport-top",
          viewport.scale === 1 ? `${viewport.offsetTop}px` : "0px",
        );
      }
      update();
      viewport.addEventListener("resize", update);
      viewport.addEventListener("scroll", update);
      return () => {
        viewport.removeEventListener("resize", update);
        viewport.removeEventListener("scroll", update);
        panel.style.removeProperty("--form-viewport-height");
        panel.style.removeProperty("--form-viewport-top");
      };
    },
    [enabled],
  );
}
