import { createECDH, randomBytes, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Notification permission needs full Chromium (see push.spec.ts).
test.use({ channel: "chromium" });

/**
 * Playwright's Chromium has no push service, so each page gets a fake
 * PushManager holding one subscription per tab (in sessionStorage, so it
 * survives a reload). The server sees a well-formed subscription on an
 * allowed host; no test sends to it.
 */
async function fakePushManager(page: Page) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  await page.addInitScript(
    ({ endpoint, p256dh, auth }) => {
      const STORE = "e2e-push-subscription";
      type Stored = { endpoint: string; key: number[] };
      const make = (data: Stored) => ({
        endpoint: data.endpoint,
        expirationTime: null,
        options: {
          userVisibleOnly: true,
          applicationServerKey: new Uint8Array(data.key).buffer,
        },
        toJSON: () => ({
          endpoint: data.endpoint,
          expirationTime: null,
          keys: { p256dh, auth },
        }),
        unsubscribe: async () => {
          sessionStorage.removeItem(STORE);
          return true;
        },
      });
      PushManager.prototype.getSubscription = async function () {
        const raw = sessionStorage.getItem(STORE);
        return (raw ? make(JSON.parse(raw)) : null) as never;
      };
      PushManager.prototype.subscribe = async function (options) {
        const data = {
          endpoint,
          key: Array.from(
            new Uint8Array(options!.applicationServerKey as ArrayBuffer),
          ),
        };
        sessionStorage.setItem(STORE, JSON.stringify(data));
        return make(data) as never;
      };
    },
    {
      endpoint: `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  );
}

const notifications = (page: Page) =>
  page.getByRole("region", { name: "Notifications", exact: true });
const deviceRows = (page: Page) =>
  page.getByRole("region", { name: "Your devices" }).getByRole("listitem");

async function turnOn(page: Page) {
  await expect(notifications(page)).toContainText(
    "Notifications are off for this device.",
  );
  await notifications(page)
    .getByRole("button", { name: "Turn on notifications" })
    .click();
  await expect(notifications(page)).toContainText(
    "Notifications are on for this device.",
  );
}

test("devices turn notifications on, and revoking one stops it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await fakePushManager(page);
  await signInAndConfirm(page);
  await page.goto("/settings");

  await expect(
    notifications(page).getByRole("heading", { name: "No devices yet" }),
  ).toBeVisible();
  await turnOn(page);
  await expect(deviceRows(page)).toHaveCount(1);
  await expect(deviceRows(page)).toContainText(/Chrome on Windows/);
  await expect(deviceRows(page)).toContainText("(this device)");
  await expect(deviceRows(page)).toContainText("No notification delivered yet");
  await expect(
    notifications(page).getByRole("button", {
      name: "Send test notification",
    }),
  ).toBeVisible();

  // A second tab plays a second browser for the same user.
  const other = await context.newPage();
  await fakePushManager(other);
  await other.goto("/settings");
  await turnOn(other);
  await expect(deviceRows(other)).toHaveCount(2);

  await page.reload();
  await expect(deviceRows(page)).toHaveCount(2);
  await expectNoSeriousViolations(page);

  // Revoke the other device from the first.
  const otherRow = deviceRows(page).filter({ hasNotText: "(this device)" });
  await otherRow.getByRole("button", { name: "Revoke" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("That device stops getting");
  await dialog.getByRole("button", { name: "Revoke" }).click();
  await expect(dialog).toBeHidden();
  await expect(deviceRows(page)).toHaveCount(1);
  await expect(deviceRows(page)).toContainText("(this device)");

  // The other browser still holds its subscription, but the server no
  // longer has it, so nothing is sent there.
  await other.reload();
  await expect(notifications(other)).toContainText(
    "Notifications are off for this device.",
  );
  await expect(deviceRows(other)).toHaveCount(1);
  await expect(deviceRows(other)).not.toContainText("(this device)");

  // Turning off on this device removes the last one.
  await notifications(page)
    .getByRole("button", { name: "Turn off on this device" })
    .click();
  await expect(
    notifications(page).getByRole("heading", { name: "No devices yet" }),
  ).toBeVisible();
  await expect(notifications(page)).toContainText(
    "Notifications are off for this device.",
  );
});

test("blocked notifications say how to allow them", async ({ page }) => {
  await fakePushManager(page);
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "denied" });
  });
  await signInAndConfirm(page);
  await page.goto("/settings");
  await expect(notifications(page)).toContainText(
    "Notifications are blocked for SoleUp in this browser.",
  );
  await expect(
    notifications(page).getByRole("button", { name: "Turn on notifications" }),
  ).toHaveCount(0);
});
