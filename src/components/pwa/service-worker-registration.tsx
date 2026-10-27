"use client";

import { useEffect } from "react";

/** Path and scope of public/sw.js. */
export const SERVICE_WORKER_URL = "/sw.js";

/**
 * Registers the service worker (push and notification clicks only, no
 * offline cache) once the page has loaded. Renders nothing. Browsers
 * without service workers simply get no notifications.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Nothing to do: everything but notifications works without it.
      });
  }, []);
  return null;
}
