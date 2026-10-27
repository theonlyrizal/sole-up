"use client";

import { useEffect, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { installPlatform } from "@/lib/install-platform";
import type { TestNotificationResult } from "@/lib/push";
import {
  revokePushDevice,
  sendTestNotification,
  subscribePush,
  unsubscribePush,
} from "@/server/modules/push/actions";

/** A subscribed device, with its dates already formatted on the server. */
export type PushDeviceView = {
  id: string;
  label: string;
  endpointHash: string;
  added: string;
  lastSuccess: string | null;
  failedCount: number;
};

type BrowserState =
  | { kind: "checking" }
  /** No Web Push here. iOS Safari outside the Home Screen app needs install. */
  | { kind: "unsupported"; needsInstall: boolean }
  /** The service worker never became ready (registration failed). */
  | { kind: "broken" }
  | {
      kind: "ready";
      permission: NotificationPermission;
      /** Hash of this browser's current subscription endpoint, if any. */
      endpointHash: string | null;
    };

type SubscriptionInput = Parameters<typeof subscribePush>[0]["subscription"];

const WORKER_READY_TIMEOUT_MS = 10_000;
const BROWSER_FAILED =
  "This browser couldn't change its notification setting. Try again in a moment.";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sameBytes(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, index) => byte === b[index]);
}

/** Matches endpointHash() on the server: SHA-256, base64url. */
async function hashEndpoint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** The service worker registration, or null if it isn't ready in time. */
async function workerRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), WORKER_READY_TIMEOUT_MS),
    ),
  ]);
}

async function readBrowserState(): Promise<BrowserState> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    const ios =
      installPlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios";
    return { kind: "unsupported", needsInstall: ios && !isStandalone() };
  }
  const registration = await workerRegistration();
  if (!registration) return { kind: "broken" };
  const subscription = await registration.pushManager.getSubscription();
  return {
    kind: "ready",
    permission: Notification.permission,
    endpointHash: subscription
      ? await hashEndpoint(subscription.endpoint)
      : null,
  };
}

function testResultMessage(result: TestNotificationResult): string {
  const devices = (n: number) => `${n} ${n === 1 ? "device" : "devices"}`;
  const parts = [`Sent to ${result.sent} of ${devices(result.total)}.`];
  if (result.removed > 0)
    parts.push(
      `${devices(result.removed)} had turned notifications off and ${result.removed === 1 ? "was" : "were"} removed.`,
    );
  if (result.failed > 0)
    parts.push(
      `${devices(result.failed)} couldn't be reached. Try again later.`,
    );
  return parts.join(" ");
}

/**
 * Notifications in Settings: turn them on or off for this browser, send a
 * test to every device, and revoke devices. Permission is asked only when
 * the user presses "Turn on notifications" (browsers require a gesture).
 */
export function PushNotifications({
  vapidPublicKey,
  devices,
}: {
  vapidPublicKey: string;
  devices: PushDeviceView[];
}) {
  const [browser, setBrowser] = useState<BrowserState>({ kind: "checking" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    readBrowserState().then(
      (state) => !cancelled && setBrowser(state),
      () => !cancelled && setBrowser({ kind: "broken" }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const thisDevice =
    browser.kind === "ready" && browser.endpointHash
      ? devices.find((device) => device.endpointHash === browser.endpointHash)
      : undefined;

  function turnOn() {
    startTransition(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setBrowser({ kind: "ready", permission, endpointHash: null });
          if (permission === "default")
            setError(
              "Notifications weren't allowed. Try again and choose Allow.",
            );
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const key = base64UrlToBytes(vapidPublicKey);
        let subscription = await registration.pushManager.getSubscription();
        // A subscription made with an older server key can't be reused.
        if (
          subscription &&
          !sameBytes(subscription.options.applicationServerKey, key)
        ) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        const result = await subscribePush({
          subscription: subscription.toJSON() as SubscriptionInput,
          maxTouchPoints: navigator.maxTouchPoints,
        });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setBrowser({
          kind: "ready",
          permission,
          endpointHash: await hashEndpoint(subscription.endpoint),
        });
        toast({
          title: "Notifications are on for this device",
          variant: "success",
        });
      } catch {
        setError(BROWSER_FAILED);
      }
    });
  }

  function turnOff() {
    startTransition(async () => {
      setError(null);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const result = await unsubscribePush({
            endpoint: subscription.endpoint,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          await subscription.unsubscribe();
        }
        setBrowser({
          kind: "ready",
          permission: Notification.permission,
          endpointHash: null,
        });
        toast({
          title: "Notifications are off for this device",
          variant: "success",
        });
      } catch {
        setError(BROWSER_FAILED);
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      setError(null);
      const result = await sendTestNotification({});
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const { sent, total } = result.data;
      if (sent === total && total > 0) {
        toast({
          title: `Test sent to ${total} ${total === 1 ? "device" : "devices"}`,
          description: "It should appear within a few seconds.",
          variant: "success",
        });
      } else {
        setError(testResultMessage(result.data));
      }
    });
  }

  async function revoke(device: PushDeviceView) {
    const result = await revokePushDevice({ id: device.id });
    if (!result.ok) return result;
    if (device.id === thisDevice?.id) {
      // Best effort: the row is gone, so nothing is sent here either way.
      try {
        const registration = await navigator.serviceWorker.ready;
        await (await registration.pushManager.getSubscription())?.unsubscribe();
      } catch {}
      setBrowser((state) =>
        state.kind === "ready" ? { ...state, endpointHash: null } : state,
      );
    }
    toast({ title: `${device.label} revoked`, variant: "success" });
    return result;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Reminders arrive as notifications on each device where you turn them on.
      </p>

      <div
        aria-live="polite"
        className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface px-3 py-3"
      >
        <ThisDeviceStatus browser={browser} on={Boolean(thisDevice)} />
        {browser.kind === "ready" && browser.permission !== "denied" && (
          <Button
            variant={thisDevice ? "secondary" : "primary"}
            size="sm"
            disabled={pending}
            onClick={thisDevice ? turnOff : turnOn}
          >
            {thisDevice ? "Turn off on this device" : "Turn on notifications"}
          </Button>
        )}
      </div>

      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>

      <section
        aria-labelledby="push-devices-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="push-devices-heading" className="font-medium">
            Your devices
          </h3>
          {devices.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={sendTest}
            >
              Send test notification
            </Button>
          )}
        </div>
        {devices.length === 0 ? (
          <EmptyState
            headingLevel={3}
            title="No devices yet"
            description="Turn on notifications on each phone or computer where you want reminders."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                isThisDevice={device.id === thisDevice?.id}
                onRevoke={() => revoke(device)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ThisDeviceStatus({
  browser,
  on,
}: {
  browser: BrowserState;
  on: boolean;
}) {
  switch (browser.kind) {
    case "checking":
      return <p className="text-muted">Checking this device…</p>;
    case "unsupported":
      return browser.needsInstall ? (
        <p>
          On iPhone and iPad, notifications only work in the app on your Home
          Screen. Follow <strong>Install the app</strong> above, open SoleUp
          from its icon, then come back here.
        </p>
      ) : (
        <p>This browser can&apos;t show notifications from SoleUp.</p>
      );
    case "broken":
      return (
        <p>
          Notifications couldn&apos;t start in this browser. Reload the page to
          try again.
        </p>
      );
    case "ready":
      if (browser.permission === "denied")
        return (
          <p>
            Notifications are blocked for SoleUp in this browser. Allow them in
            the browser&apos;s site settings, then reload this page.
          </p>
        );
      return (
        <p>
          Notifications are <strong>{on ? "on" : "off"}</strong> for this
          device.
        </p>
      );
  }
}

function DeviceRow({
  device,
  isThisDevice,
  onRevoke,
}: {
  device: PushDeviceView;
  isThisDevice: boolean;
  onRevoke: () => ReturnType<typeof revokePushDevice>;
}) {
  const labelId = useId();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p id={labelId} className="font-medium">
          {device.label}
          {isThisDevice && (
            <span className="text-sm font-normal text-muted">
              {" "}
              (this device)
            </span>
          )}
        </p>
        <p className="text-sm text-muted">
          Added {device.added} ·{" "}
          {device.lastSuccess
            ? `Last notification ${device.lastSuccess}`
            : "No notification delivered yet"}
        </p>
        {device.failedCount > 0 && (
          <p className="text-sm text-danger">
            The last{" "}
            {device.failedCount === 1
              ? "attempt"
              : `${device.failedCount} attempts`}{" "}
            to reach it failed.
          </p>
        )}
      </div>
      <ConfirmDialog
        trigger={
          <Button variant="secondary" size="sm" aria-describedby={labelId}>
            Revoke
          </Button>
        }
        title={`Revoke ${device.label}?`}
        description={
          isThisDevice
            ? "This device stops getting SoleUp notifications. You can turn them on again here."
            : "That device stops getting SoleUp notifications. To get them there again, turn notifications on from that device."
        }
        confirmLabel="Revoke"
        onConfirm={onRevoke}
      />
    </li>
  );
}
