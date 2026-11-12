"use client";

import { createContext, useContext } from "react";

/** Allows a portalled surface to inherit a scoped theme, as in the gallery. */
export const OverlayContainer = createContext<HTMLElement | null>(null);

export function useOverlayContainer() {
  return useContext(OverlayContainer) ?? undefined;
}
