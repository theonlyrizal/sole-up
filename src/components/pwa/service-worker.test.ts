import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
const ORIGIN = "https://soleup.test";

type FakeWindow = {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
};

function fakeWindow(url: string, navigate?: () => Promise<unknown>) {
  const client: FakeWindow = {
    url,
    focus: vi.fn(async () => client),
    navigate: vi.fn(
      navigate ?? (async (to: string) => ({ ...client, url: to })),
    ),
  };
  return client;
}

/** Runs public/sw.js against a fake worker scope. */
function loadWorker(windows: FakeWindow[] = []) {
  const listeners = new Map<string, (event: object) => void>();
  const fetch = vi.fn();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: object) => void) =>
      listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async (url: string) => ({ url })),
    },
    registration: {
      showNotification: vi.fn<
        (title: string, options: object) => Promise<void>
      >(async () => {}),
    },
  };
  runInNewContext(SOURCE, { self, URL, fetch });

  async function dispatch(type: string, event: object = {}) {
    let pending: Promise<unknown> | undefined;
    listeners.get(type)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    return pending;
  }

  async function push(data: { json: () => unknown } | null) {
    await dispatch("push", { data });
    return self.registration.showNotification.mock.calls.at(-1);
  }

  async function click(data: unknown, action = "") {
    const notification = { data, close: vi.fn() };
    const result = await dispatch("notificationclick", {
      notification,
      action,
    });
    return { result, notification };
  }

  return { self, listeners, fetch, push, click };
}

const payload = (value: unknown) => ({ json: () => value });
const ID = "0b6c6d0e-0000-4000-8000-000000000001";

describe("service worker", () => {
  it("handles install, activate, push and clicks only (no fetch, no cache)", async () => {
    const worker = loadWorker();
    expect([...worker.listeners.keys()].sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
    await worker.listeners.get("install")!({});
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    let claimed: Promise<unknown> | undefined;
    worker.listeners.get("activate")!({
      waitUntil: (p: Promise<unknown>) => (claimed = p),
    });
    await claimed;
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  describe("push", () => {
    it("shows the payload's title and body as given", async () => {
      const worker = loadWorker();
      const [title, options] = (await worker.push(
        payload({
          title: "Dentist",
          body: "Today 15:30",
          url: "/plan/calendar?view=day",
          tag: "reminder-1",
        }),
      ))!;
      expect(title).toBe("Dentist");
      expect(options).toEqual({
        body: "Today 15:30",
        icon: "/icons/icon-192.png",
        tag: "reminder-1",
        data: { url: "/plan/calendar?view=day" },
      });
      expect(worker.fetch).not.toHaveBeenCalled();
    });

    it("opens /home by default and ignores fields of the wrong type", async () => {
      const worker = loadWorker();
      const [title, options] = (await worker.push(
        payload({ title: "You have a reminder · 09:00", body: 3, tag: "" }),
      ))!;
      expect(title).toBe("You have a reminder · 09:00");
      expect(options).toMatchObject({
        body: undefined,
        tag: undefined,
        data: { url: "/home" },
      });
    });

    it("offers snooze on a task or event reminder, keeping its ID", async () => {
      const worker = loadWorker();
      const [, options] = (await worker.push(
        payload({ title: "Dentist · 14:00", url: "/plan", reminderId: ID }),
      ))!;
      expect(options).toMatchObject({
        actions: [
          { action: "snooze-15", title: "Snooze 15 min" },
          { action: "snooze-60", title: "Snooze 1 hour" },
        ],
        data: { url: "/plan", reminderId: ID },
      });
      expect(worker.fetch).not.toHaveBeenCalled();
    });

    it.each([
      ["no reminder ID", {}],
      ["a reminder ID that isn't one", { reminderId: "../../sign-out" }],
    ])("offers no snooze with %s", async (_, extra) => {
      const worker = loadWorker();
      const [, options] = (await worker.push(
        payload({ title: "Time to plan your day", ...extra }),
      ))!;
      expect(options).not.toHaveProperty("actions");
      expect(options).toMatchObject({ data: { reminderId: undefined } });
    });

    it.each([
      ["no payload", null],
      [
        "a payload that isn't JSON",
        {
          json: () => {
            throw new SyntaxError("bad");
          },
        },
      ],
      ["no title", payload({ body: "Dentist" })],
      ["a blank title", payload({ title: "  " })],
      ["a non-object payload", payload("Dentist")],
    ])("shows a generic reminder for %s", async (_, data) => {
      const worker = loadWorker();
      const [title, options] = (await worker.push(data))!;
      expect(title).toBe("SoleUp");
      expect(options).toMatchObject({
        body: "You have a reminder",
        data: { url: "/home" },
      });
    });
  });

  describe("notification click", () => {
    it("closes the notification and opens the deep link in a new window when no tab is open", async () => {
      const worker = loadWorker();
      const { notification } = await worker.click({ url: "/plan/today" });
      expect(notification.close).toHaveBeenCalled();
      expect(worker.self.clients.matchAll).toHaveBeenCalledWith({
        type: "window",
        includeUncontrolled: true,
      });
      expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
        `${ORIGIN}/plan/today`,
      );
    });

    it("focuses a tab already showing the link", async () => {
      const other = fakeWindow(`${ORIGIN}/goals`);
      const showing = fakeWindow(`${ORIGIN}/plan/today`);
      const worker = loadWorker([other, showing]);
      await worker.click({ url: "/plan/today" });
      expect(showing.focus).toHaveBeenCalled();
      expect(other.focus).not.toHaveBeenCalled();
      expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
    });

    it("focuses an open tab and takes it to the link", async () => {
      const tab = fakeWindow(`${ORIGIN}/goals`);
      const worker = loadWorker([tab]);
      await worker.click({ url: "/plan/calendar?view=day&item=e1" });
      expect(tab.focus).toHaveBeenCalled();
      expect(tab.navigate).toHaveBeenCalledWith(
        `${ORIGIN}/plan/calendar?view=day&item=e1`,
      );
      expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
    });

    it("opens a new window when the open tab can't be navigated", async () => {
      const tab = fakeWindow(`${ORIGIN}/goals`, async () => {
        throw new TypeError("not controlled");
      });
      const worker = loadWorker([tab]);
      await worker.click({ url: "/plan/today" });
      expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
        `${ORIGIN}/plan/today`,
      );
    });

    it.each([
      ["snooze-15", 15],
      ["snooze-60", 60],
    ])(
      "%s snoozes the reminder with the session cookie and opens nothing",
      async (action, minutes) => {
        const worker = loadWorker();
        worker.fetch.mockResolvedValue({ ok: true });
        const { notification } = await worker.click(
          { url: "/plan/today", reminderId: ID },
          action,
        );
        expect(notification.close).toHaveBeenCalled();
        expect(worker.fetch).toHaveBeenCalledWith(
          new URL(`${ORIGIN}/api/reminders/${ID}/snooze`),
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ minutes }),
          },
        );
        expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["refused (signed out, too late)", async () => ({ ok: false })],
      [
        "unreachable",
        async () => {
          throw new TypeError("offline");
        },
      ],
    ])("opens the deep link when the snooze is %s", async (_, response) => {
      const worker = loadWorker();
      worker.fetch.mockImplementation(response);
      await worker.click({ url: "/plan/today", reminderId: ID }, "snooze-15");
      expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
        `${ORIGIN}/plan/today`,
      );
    });

    it("opens the app for a snooze action without a reminder ID", async () => {
      const worker = loadWorker();
      await worker.click({ url: "/plan/today" }, "snooze-15");
      expect(worker.fetch).not.toHaveBeenCalled();
      expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
        `${ORIGIN}/plan/today`,
      );
    });

    it.each([
      ["another origin", { url: "https://evil.example/phish" }],
      ["a protocol-relative URL", { url: "//evil.example/phish" }],
      ["a javascript: URL", { url: "javascript:alert(1)" }],
      ["no URL", {}],
      ["no data", null],
    ])("opens /home for %s", async (_, data) => {
      const worker = loadWorker();
      await worker.click(data);
      expect(worker.self.clients.openWindow).toHaveBeenCalledWith(
        `${ORIGIN}/home`,
      );
    });
  });
});
