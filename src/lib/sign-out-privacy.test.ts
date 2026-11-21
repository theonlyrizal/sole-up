import { afterEach, describe, expect, it, vi } from "vitest";

import { clearBrowserNotifications } from "./sign-out-privacy";

afterEach(() => vi.unstubAllGlobals());

describe("sign-out browser privacy", () => {
  it("does not wait for a worker that was never registered", async () => {
    const getRegistration = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
    await clearBrowserNotifications();
    expect(getRegistration).toHaveBeenCalledWith("/");
  });

  it("invalidates delivery before clearing displayed notifications", async () => {
    const order: string[] = [];
    const unsubscribe = vi.fn(async () => {
      order.push("unsubscribe");
      return true;
    });
    const close = vi.fn(() => {
      order.push("close");
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: { getSubscription: async () => ({ unsubscribe }) },
          getNotifications: async () => [{ close }],
        }),
      },
    });
    await clearBrowserNotifications();
    expect(order).toEqual(["unsubscribe", "close"]);
  });

  it("fails closed when the browser still has an active subscription", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => ({ unsubscribe: async () => false }),
          },
          getNotifications: vi.fn(),
        }),
      },
    });
    await expect(clearBrowserNotifications()).rejects.toThrow(
      "Could not disable",
    );
  });

  it("works without service workers", async () => {
    vi.stubGlobal("navigator", {});
    await expect(clearBrowserNotifications()).resolves.toBeUndefined();
  });
});
