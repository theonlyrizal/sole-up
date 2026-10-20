"use client";

import { Toast as ToastPrimitive } from "radix-ui";
import { useSyncExternalStore } from "react";

import { cx, focusRing } from "./cx";

export type ToastVariant = "info" | "success" | "error";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastItem = ToastOptions & { id: number };

/*
 * A tiny store, so `toast()` can be called from any client code and the
 * `<Toaster />` can sit beside the page instead of wrapping it. Wrapping
 * server-streamed content in the Radix provider made React re-render that
 * content on the client instead of hydrating it.
 */
let toasts: ToastItem[] = [];
let lastId = 0;
const listeners = new Set<() => void>();
const noToasts: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function remove(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

/**
 * Shows a toast. Use it to confirm an action, never as the only place an
 * error that needs fixing is shown. Needs a `<Toaster />` on the page.
 */
export function toast(options: ToastOptions) {
  lastId += 1;
  toasts = [...toasts, { ...options, id: lastId }];
  emit();
}

/**
 * Renders toasts. Announced politely (errors assertively), paused while
 * hovered or focused, and F8 moves focus to them. Render once per layout.
 */
export function Toaster() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => noToasts,
  );
  return (
    <ToastPrimitive.Provider swipeDirection="right" label="Notification">
      {items.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          type={item.variant === "error" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) remove(item.id);
          }}
          className={cx(
            "flex items-start gap-3 rounded-lg border bg-surface p-4 shadow-lg",
            item.variant === "error" ? "border-danger" : "border-border",
          )}
        >
          <div className="flex flex-1 flex-col gap-1">
            <ToastPrimitive.Title
              className={cx(
                "text-sm font-semibold",
                item.variant === "error" && "text-danger",
                item.variant === "success" && "text-success",
              )}
            >
              {item.title}
            </ToastPrimitive.Title>
            {item.description && (
              <ToastPrimitive.Description className="text-sm text-muted">
                {item.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className={cx(
              "-m-1 rounded-md p-1 text-muted hover:bg-surface-muted hover:text-fg",
              focusRing,
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      {/* Above the mobile bottom bar; bottom-right on wider screens. */}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-20 z-50 flex w-full max-w-sm flex-col gap-2 p-4 outline-none md:bottom-0" />
    </ToastPrimitive.Provider>
  );
}
