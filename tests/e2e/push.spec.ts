import { expect, test } from "@playwright/test";

import { activeServiceWorker } from "./helpers";

// The default headless shell refuses notification permission; full Chromium
// in new headless mode grants it. `playwright install chromium` installs
// both. Its own file because a browser channel can't be set per group.
test.use({ channel: "chromium" });

test("a push shows the payload's text as a notification", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["notifications"]);
  await page.goto("/sign-in");
  await activeServiceWorker(page);

  // Chromium's DevTools protocol delivers a push straight to the worker, as
  // the push service would.
  const cdp = await context.newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const ours = registrations.find((r) => r.scopeURL === `${baseURL}/`);
      if (ours && !ours.isDeleted) resolve(ours.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: baseURL!,
    registrationId: await registrationId,
    data: JSON.stringify({
      title: "Dentist",
      body: "Today 15:30",
      url: "/plan/today",
      tag: "e2e-push",
    }),
  });

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        const shown = await registration.getNotifications({ tag: "e2e-push" });
        return shown.map((n) => ({
          title: n.title,
          body: n.body,
          data: n.data,
        }));
      }),
    )
    .toEqual([
      { title: "Dentist", body: "Today 15:30", data: { url: "/plan/today" } },
    ]);
});
