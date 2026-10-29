// Web Push subscriptions (chunk 5.3). Pure: shared by the schema, the
// server module and the Settings UI.

/** Longest endpoint URL accepted. Real ones are well under 1 KB. */
export const PUSH_ENDPOINT_MAX = 2048;

/** Longest device label, e.g. "Samsung Internet on Android". */
export const DEVICE_LABEL_MAX = 64;

/** Most devices one user can subscribe, which bounds a test send's fan-out. */
export const PUSH_DEVICE_LIMIT = 20;

/**
 * The push services browsers use. The server POSTs to a subscription's
 * endpoint, so an endpoint on any other host is refused: otherwise a
 * crafted "subscription" could make the server send requests to any URL.
 * Exact hosts, or a suffix starting with a dot.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = [
  "fcm.googleapis.com", // Chrome, Android, Opera, Samsung Internet, Brave
  "android.googleapis.com", // older Chrome subscriptions
  "updates.push.services.mozilla.com", // Firefox
  ".notify.windows.com", // Edge on Windows
  ".push.apple.com", // Safari on macOS, iOS and iPadOS (web.push.apple.com)
];

/** True for an https endpoint on one of the known push services. */
export function isKnownPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) =>
    allowed.startsWith(".") ? host.endsWith(allowed) : host === allowed,
  );
}

/**
 * The payload the service worker (public/sw.js) shows, exactly as sent.
 * `url` is a same-origin path opened on click; `tag` makes a resend replace
 * the earlier notification rather than add another.
 */
export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  /**
   * A task or event reminder's row ID: the notification then offers
   * "Snooze 15 min" and "Snooze 1 hour" (5.6). Never on the nudge, the
   * weekly review reminder or a bundle.
   */
  reminderId?: string;
};

/** A subscribed device as Settings shows it. Never carries keys or endpoints. */
export type PushDevice = {
  id: string;
  label: string;
  /**
   * SHA-256 of the endpoint (base64url), so the page can tell which row is
   * this browser without the server sending any endpoint to the client.
   */
  endpointHash: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
  failedCount: number;
};

/** What a test send did, per device outcome. */
export type TestNotificationResult = {
  total: number;
  sent: number;
  /** Devices the push service said no longer exist; their rows were deleted. */
  removed: number;
  failed: number;
};
