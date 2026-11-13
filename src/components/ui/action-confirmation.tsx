"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useMediaQuery } from "@/components/hooks/use-media-query";
import { Icon, type IconName } from "@/components/icons/icon";
import { LoadingIndicator } from "./loading-indicator";

export type ConfirmationPhase = "idle" | "pending" | "confirmed" | "error";
type ConfirmationKey = string | number;

function durationMs(tokens: CSSStyleDeclaration, property: string) {
  // Optimized styles may serialize a millisecond token in seconds.
  const time = tokens.getPropertyValue(property).trim();
  return Number.parseFloat(time) * (time.endsWith("ms") ? 1 : 1000);
}

/** The owner retains the key for repeated results and clears it on correction. */
export function ActionConfirmation({
  phase,
  confirmationKey,
  confirmedIcon = "check",
  status,
  children,
}: {
  phase: ConfirmationPhase;
  confirmationKey?: ConfirmationKey;
  confirmedIcon?: IconName;
  /** Optional accessible text. Keep the live region in the owner. */
  status?: string;
  children: ReactNode;
}) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const seen = useRef<Set<ConfirmationKey> | null>(null);
  if (seen.current === null) {
    seen.current = new Set(
      confirmationKey === undefined ? [] : [confirmationKey],
    );
  }
  const halo = useRef<HTMLSpanElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const keys = seen.current!;
    if (
      phase !== "confirmed" ||
      confirmationKey === undefined ||
      keys.has(confirmationKey)
    )
      return;
    keys.add(confirmationKey);
    if (reducedMotion !== false || !halo.current || !glyph.current) return;

    const tokens = getComputedStyle(halo.current);
    const haloAnimation = halo.current.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      {
        duration: durationMs(tokens, "--feedback-halo-duration"),
        easing: tokens.getPropertyValue("--ease-default-effects"),
      },
    );
    const iconAnimation = glyph.current.animate(
      [{ scale: 0.8 }, { scale: 1 }],
      {
        duration: durationMs(tokens, "--duration-expressive-fast-spatial"),
        easing: tokens.getPropertyValue("--ease-expressive-fast-spatial"),
      },
    );
    return () => {
      haloAnimation.cancel();
      iconAnimation.cancel();
    };
  }, [phase, confirmationKey, reducedMotion]);

  return (
    <span className="inline-flex items-center">
      <span
        aria-hidden="true"
        className="relative isolate grid size-8 shrink-0 place-items-center"
      >
        <span
          ref={halo}
          className="confirmation-halo pointer-events-none absolute inset-0 -z-10 rounded-full bg-confirmation-surface opacity-0"
        />
        <span
          ref={glyph}
          className="confirmation-glyph grid place-items-center"
        >
          {phase === "idle" && children}
          {phase === "pending" && (
            <LoadingIndicator decorative size={18} className="text-inherit" />
          )}
          {phase === "confirmed" && <Icon name={confirmedIcon} size={20} />}
          {phase === "error" && <Icon name="error" size={20} />}
        </span>
      </span>
      {status && <span className="sr-only">{status}</span>}
    </span>
  );
}
