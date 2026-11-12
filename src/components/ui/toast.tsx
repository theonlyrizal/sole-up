"use client";

import { Toast as ToastPrimitive } from "radix-ui";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/icon";

import { buttonClass } from "./button";
import { IconButton } from "./icon-button";

export type ToastVariant = "info" | "success" | "error";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /**
   * One button in the toast, such as Undo. `altText` tells screen reader
   * users how to do the same without the toast, which may have gone.
   */
  action?: { label: string; altText: string; onClick: () => void };
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
    <ToastPrimitive.Provider
      swipeDirection="right"
      label="Notification"
      duration={4000}
    >
      {items.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          type={item.variant === "error" ? "foreground" : "background"}
          // Longer with an action, so there is time to reach it.
          duration={item.action ? 8000 : undefined}
          onOpenChange={(open) => {
            if (!open) remove(item.id);
          }}
          className="snackbar pointer-events-auto flex min-h-12 flex-wrap items-center gap-x-2 rounded-xs bg-inverse-surface px-4 py-2 text-body-medium text-inverse-on-surface shadow-3"
        >
          <div className="flex min-w-40 flex-1 items-start gap-2 py-1 wrap-anywhere">
            {item.variant === "error" && (
              <Icon name="error" size={20} className="shrink-0" />
            )}
            <div>
              <ToastPrimitive.Title
                className={item.description ? "font-medium" : undefined}
              >
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description>
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
          </div>
          {item.action && (
            <div className="ms-auto flex items-center gap-1">
              <ToastPrimitive.Action
                altText={item.action.altText}
                onClick={item.action.onClick}
                className={buttonClass({
                  variant: "text",
                  size: "xs",
                  className: "snackbar-action",
                })}
              >
                {item.action.label}
              </ToastPrimitive.Action>
              <ToastPrimitive.Close asChild>
                <IconButton
                  icon="close"
                  label="Dismiss"
                  tooltip={false}
                  className="snackbar-close"
                />
              </ToastPrimitive.Close>
            </div>
          )}
        </ToastPrimitive.Root>
      ))}
      {/* Keep the existing shell offsets until UI-3 replaces its navigation. */}
      <ToastPrimitive.Viewport className="pointer-events-none fixed right-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex w-full max-w-[592px] flex-col gap-2 p-4 md:bottom-0" />
    </ToastPrimitive.Provider>
  );
}
