"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    viewport?.removeEventListener("resize", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function keyboardIsOpen() {
  const viewport = window.visualViewport;
  return Boolean(
    viewport && viewport.height * viewport.scale < window.innerHeight * 0.75,
  );
}

export function useKeyboardOpen() {
  return useSyncExternalStore(subscribe, keyboardIsOpen, () => false);
}
