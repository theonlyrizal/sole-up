/*
 * SoleUp service worker: shows pushed notifications, opens the app when one
 * is clicked, and snoozes a reminder from its notification. Nothing else.
 * There is no fetch handler and no cache, so every page load goes to the
 * network as if this file didn't exist.
 *
 * Push payload (JSON, built by the server):
 *   { "title": string, "body"?: string, "url"?: string, "tag"?: string,
 *     "reminderId"?: string }
 * - title and body are shown exactly as sent. The worker never fetches
 *   anything, so a private-mode payload stays private.
 * - url is a path on this origin to open on click (default /home). Any other
 *   origin is ignored.
 * - tag lets a later notification replace an earlier one.
 * - reminderId (a task or event reminder) adds "Snooze 15 min" and "Snooze
 *   1 hour" actions. Choosing one POSTs to /api/reminders/<id>/snooze with
 *   the session cookie; if that fails (signed out, too late), the app opens
 *   at url instead, where the item's dialog can snooze or explain.
 * A push without a readable payload still has to show something (browsers
 * require it), so it gets a generic reminder text.
 *
 * This file is served as is from public/, so it is plain browser JavaScript
 * with no imports. It never logs.
 */

const FALLBACK_TITLE = "SoleUp";
const FALLBACK_BODY = "You have a reminder";
const DEFAULT_PATH = "/home";
const ICON = "/icons/icon-192.png";
const SNOOZE_ACTIONS = [
  { action: "snooze-15", title: "Snooze 15 min", minutes: 15 },
  { action: "snooze-60", title: "Snooze 1 hour", minutes: 60 },
];
const REMINDER_ID = /^[0-9a-f-]{36}$/i;

// No cache to migrate, so a new version can take over open tabs at once.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const message = readPayload(event.data);
  const options = {
    body: message.body,
    icon: ICON,
    tag: message.tag,
    data: { url: message.url, reminderId: message.reminderId },
  };
  if (message.reminderId) {
    options.actions = SNOOZE_ACTIONS.map(({ action, title }) => ({
      action,
      title,
    }));
  }
  event.waitUntil(self.registration.showNotification(message.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const url = sameOriginUrl(data && data.url);
  const snooze = SNOOZE_ACTIONS.find(({ action }) => action === event.action);
  if (snooze && data && data.reminderId) {
    event.waitUntil(snoozeOrOpen(data.reminderId, snooze.minutes, url));
    return;
  }
  event.waitUntil(openApp(url));
});

/** Snoozes the reminder; when that fails, opens the app at `url`. */
async function snoozeOrOpen(reminderId, minutes, url) {
  try {
    const response = await fetch(
      new URL(`/api/reminders/${reminderId}/snooze`, self.location.origin),
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minutes }),
      },
    );
    if (response.ok) return;
  } catch {
    // Offline or the server is unreachable: open the app instead.
  }
  return openApp(url);
}

/** The payload's fields, or the generic text when it can't be read. */
function readPayload(data) {
  let payload = null;
  try {
    payload = data ? data.json() : null;
  } catch {
    payload = null;
  }
  if (
    !payload ||
    typeof payload.title !== "string" ||
    payload.title.trim() === ""
  ) {
    return { title: FALLBACK_TITLE, body: FALLBACK_BODY, url: DEFAULT_PATH };
  }
  return {
    title: payload.title,
    body: typeof payload.body === "string" ? payload.body : undefined,
    url: typeof payload.url === "string" ? payload.url : DEFAULT_PATH,
    tag:
      typeof payload.tag === "string" && payload.tag !== ""
        ? payload.tag
        : undefined,
    reminderId:
      typeof payload.reminderId === "string" &&
      REMINDER_ID.test(payload.reminderId)
        ? payload.reminderId
        : undefined,
  };
}

/** An absolute URL on this origin; anything else falls back to /home. */
function sameOriginUrl(value) {
  const origin = self.location.origin;
  if (typeof value === "string") {
    try {
      const url = new URL(value, origin);
      if (url.origin === origin) return url.href;
    } catch {
      // Not a URL: use the default.
    }
  }
  return new URL(DEFAULT_PATH, origin).href;
}

/**
 * Focuses a tab already showing the URL, else focuses any open SoleUp tab
 * and takes it there, else opens a new window.
 */
async function openApp(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const showing = windows.find((client) => client.url === url);
  if (showing) return showing.focus();

  const open = windows[0];
  if (open) {
    try {
      const focused = await open.focus();
      // navigate() resolves to null when the page is on another origin
      // after the redirect; the tab is focused either way.
      return (await focused.navigate(url)) || focused;
    } catch {
      // A tab this worker doesn't control can't be navigated: open a new one.
    }
  }
  return self.clients.openWindow(url);
}
