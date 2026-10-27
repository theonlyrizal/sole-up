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

  async function click(data: unknown) {
    const notification = { data, close: vi.fn() };
    const result = await dispatch("notificationclick", { notification });
    return { result, notification };
  }

  return { self, listeners, fetch, push, click };
}

const payload = (value: unknown) => ({ json: () => value });

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
