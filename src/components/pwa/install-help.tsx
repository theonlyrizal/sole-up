"use client";

import { useSyncExternalStore } from "react";

import { installPlatform, type InstallPlatform } from "@/lib/install-platform";

const STANDALONE_QUERY = "(display-mode: standalone)";

const noSubscription = () => () => {};

function readPlatform(): InstallPlatform {
  return installPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

/** This device's install steps; null while rendering on the server. */
function usePlatform(): InstallPlatform | null {
  return useSyncExternalStore(noSubscription, readPlatform, () => null);
}

/**
 * Whether the page runs as the installed app; null on the server. iOS
 * Safari also reports it as `navigator.standalone`.
 */
function useInstalled(): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(STANDALONE_QUERY);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      window.matchMedia(STANDALONE_QUERY).matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => null,
  );
}

type Steps = {
  platform: InstallPlatform;
  title: string;
  body: React.ReactNode;
};

const STEPS: Steps[] = [
  {
    platform: "ios",
    title: "iPhone and iPad",
    body: (
      <>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open SoleUp in Safari.</li>
          <li>
            Tap <strong>Share</strong> (the square with an arrow pointing up).
          </li>
          <li>
            Tap <strong>Add to Home Screen</strong> (scroll down the list if
            it&apos;s hidden), then <strong>Add</strong>.
          </li>
          <li>Open SoleUp from the new icon on your Home Screen.</li>
        </ol>
        <p>
          iPhone and iPad only show notifications from the Home Screen app, not
          from a Safari tab, and need iOS or iPadOS 16.4 or later.
        </p>
      </>
    ),
  },
  {
    platform: "android",
    title: "Android",
    body: (
      <p>
        In Chrome, open the <strong>⋮</strong> menu and tap{" "}
        <strong>Install app</strong> (or <strong>Add to Home screen</strong>,
        then <strong>Install</strong>). Other browsers have a similar option in
        their menu.
      </p>
    ),
  },
  {
    platform: "desktop",
    title: "Computer",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Chrome or Edge: click the install icon at the right of the address
          bar, or open the browser menu and choose{" "}
          <strong>Install SoleUp</strong>.
        </li>
        <li>
          Safari on a Mac: choose <strong>File › Add to Dock</strong>.
        </li>
        <li>
          If your browser has no install option, SoleUp still works in a tab.
        </li>
      </ul>
    ),
  },
];

/**
 * How to install SoleUp as an app. Every device's steps are always shown
 * (detection is a guess), with this device's marked once the page has
 * loaded. On iPhone and iPad installing is required for notifications, so
 * that case gets a note at the top.
 */
export function InstallHelp() {
  const platform = usePlatform();
  const installed = useInstalled();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Installing puts SoleUp on your home screen or dock and opens it in its
        own window. It updates itself, like the website.
      </p>
      <div aria-live="polite">
        {installed ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2">
            You&apos;re using the installed app on this device.
          </p>
        ) : (
          platform === "ios" && (
            <p className="rounded-md border border-border bg-surface-muted px-3 py-2">
              On this device, notifications only work after you add SoleUp to
              your Home Screen.
            </p>
          )
        )}
      </div>
      {STEPS.map((steps) => (
        <section
          key={steps.platform}
          aria-labelledby={`install-${steps.platform}`}
          className="flex flex-col gap-2"
        >
          <h3
            id={`install-${steps.platform}`}
            className="flex items-baseline gap-2 font-medium"
          >
            {steps.title}
            {platform === steps.platform && (
              <>
                {" "}
                <span className="text-sm font-normal text-muted">
                  (this device)
                </span>
              </>
            )}
          </h3>
          <div className="flex flex-col gap-2 text-sm">{steps.body}</div>
        </section>
      ))}
    </div>
  );
}
