"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons/icon";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { InlineBanner } from "@/components/ui/inline-banner";
import { ListGroup, ListItem } from "@/components/ui/list";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
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
  const [action, setAction] = useState<"on" | "off" | "test">();
  const [removing, setRemoving] = useState<PushDeviceView>();
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const devicesHeading = useRef<HTMLHeadingElement>(null);

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
    setAction("on");
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
    setAction("off");
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
    setAction("test");
    startTransition(async () => {
      setError(null);
      try {
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
      } catch {
        setError("Couldn't send the test notification. Try again.");
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
    toast({ title: `${device.label} removed`, variant: "success" });
    return result;
  }

  return (
    <div className="grid gap-5">
      <section
        aria-labelledby="this-device-heading"
        className="grid gap-3 rounded-xl bg-surface-container-low p-4"
      >
        <h3 id="this-device-heading" className="text-title-medium">
          This device
        </h3>
        <div
          aria-live="polite"
          className="text-body-medium text-on-surface-variant"
        >
          <ThisDeviceStatus browser={browser} on={Boolean(thisDevice)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {browser.kind === "ready" && browser.permission !== "denied" && (
            <Button
              variant={thisDevice ? "text" : "filled"}
              disabled={pending}
              pending={pending && action !== "test"}
              onClick={thisDevice ? turnOff : turnOn}
            >
              {pending && action !== "test"
                ? "Updating notifications…"
                : thisDevice
                  ? "Turn off on this device"
                  : "Turn on notifications on this device"}
            </Button>
          )}
          {devices.length > 0 && (
            <Button
              variant="tonal"
              disabled={pending}
              pending={pending && action === "test"}
              onClick={sendTest}
            >
              {pending && action === "test"
                ? "Sending…"
                : "Send a test notification"}
            </Button>
          )}
        </div>
        {devices.length > 0 && (
          <p className="text-body-medium text-on-surface-variant">
            A test notification goes to all your subscribed devices.
          </p>
        )}
        {error && <InlineBanner tone="error">{error}</InlineBanner>}
      </section>

      <section aria-labelledby="push-devices-heading" className="grid gap-3">
        <h3
          id="push-devices-heading"
          ref={devicesHeading}
          tabIndex={-1}
          className="text-title-medium"
        >
          Your devices
        </h3>
        {devices.length === 0 ? (
          <EmptyState
            headingLevel={4}
            compact
            className="rounded-xl bg-surface-container-low"
            title="No devices yet"
            description="Turn on notifications where you want to receive reminders."
          />
        ) : (
          <ListGroup label="Subscribed devices">
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                isThisDevice={device.id === thisDevice?.id}
                onRemove={(trigger) => {
                  removeTrigger.current = trigger;
                  setRemoving(device);
                }}
              />
            ))}
          </ListGroup>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const trigger = removeTrigger.current;
          if (trigger?.isConnected) trigger.focus();
          else devicesHeading.current?.focus();
        }}
        title={`Remove ${removing?.label ?? "device"}?`}
        description={
          removing && removing.id === thisDevice?.id
            ? "This device stops getting SoleUp notifications. You can turn them on again here."
            : "That device stops getting SoleUp notifications. To get them there again, turn notifications on from that device."
        }
        confirmLabel="Remove"
        icon="devices"
        onConfirm={() => removing && revoke(removing)}
      />
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
          Screen. Follow{" "}
          <Link
            href="#install"
            className="font-medium text-primary underline underline-offset-4"
          >
            Install the app
          </Link>
          , open SoleUp from its icon, then come back here.
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
  onRemove,
}: {
  device: PushDeviceView;
  isThisDevice: boolean;
  onRemove: (trigger: HTMLButtonElement | null) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  return (
    <ListItem
      className="bg-surface-container-low"
      leading={<Icon name="devices" className="text-primary" />}
      headline={
        <>
          {device.label}
          {isThisDevice && (
            <span className="text-body-medium"> (this device)</span>
          )}
        </>
      }
      supporting={
        <div className="grid gap-1">
          <p>Added {device.added}</p>
          <p>
            {device.lastSuccess
              ? `Last delivered ${device.lastSuccess}`
              : "No notification delivered yet"}
          </p>
          {device.failedCount > 0 && (
            <div>
              <Chip
                type="status"
                tone="error"
                label={`${device.failedCount} failed ${device.failedCount === 1 ? "attempt" : "attempts"}`}
              />
            </div>
          )}
        </div>
      }
      wrapSupporting
      wrapActions
      trailing={
        <Menu modal={false}>
          <MenuTrigger asChild>
            <IconButton
              ref={trigger}
              icon="more_vert"
              label={`Actions for ${device.label}`}
              tooltip={false}
            />
          </MenuTrigger>
          <MenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (openingDialog.current) event.preventDefault();
              openingDialog.current = false;
            }}
          >
            <MenuItem
              icon="remove"
              destructive
              onSelect={() => {
                openingDialog.current = true;
                onRemove(trigger.current);
              }}
            >
              Remove…
            </MenuItem>
          </MenuContent>
        </Menu>
      }
    />
  );
}
