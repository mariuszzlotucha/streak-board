import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_ERRORS_PATH,
  UPDATE_CHECK_INTERVAL_MS,
  isUpdate,
  registerServiceWorker,
  type PwaEnvironment,
} from "@/lib/pwa/register";

/** A stubbed `navigator.serviceWorker` whose `controllerchange` the test fires by hand. */
function stub({
  controller = null as object | null,
  register = vi.fn(() => Promise.resolve({ update: vi.fn() })),
} = {}) {
  const listeners: (() => void)[] = [];
  const serviceWorker = {
    controller,
    register,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
  };
  const env = {
    serviceWorker: serviceWorker as unknown as PwaEnvironment["serviceWorker"],
    sendBeacon: vi.fn(() => true),
    showNotice: vi.fn(),
  };
  const takeOver = (next: object) => {
    serviceWorker.controller = next;
    listeners.forEach((listener) => {
      listener();
    });
  };
  return { env, takeOver, register };
}

describe("isUpdate", () => {
  it("is an update only when a worker controlled the page before", () => {
    expect(isUpdate({})).toBe(true);
    expect(isUpdate(null)).toBe(false);
    expect(isUpdate(undefined)).toBe(false);
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js with scope /", async () => {
    const { env, register } = stub();
    await registerServiceWorker(env);

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("shows the message when a new worker replaces a previous controller", async () => {
    const { env, takeOver } = stub({ controller: {} });
    await registerServiceWorker(env);
    takeOver({});

    expect(env.showNotice).toHaveBeenCalledOnce();
    expect(env.sendBeacon).not.toHaveBeenCalled();
  });

  it("shows no message on the first install, and does on the next release", async () => {
    const { env, takeOver } = stub();
    await registerServiceWorker(env);
    takeOver({});

    expect(env.showNotice).not.toHaveBeenCalled();

    takeOver({});
    expect(env.showNotice).toHaveBeenCalledOnce();
  });

  it("sends one beacon with sw_register_failed when register() rejects", async () => {
    const { env } = stub({ register: vi.fn(() => Promise.reject(new Error("blocked at https://x/?e=a@b.c"))) });
    await registerServiceWorker(env);

    expect(env.sendBeacon).toHaveBeenCalledOnce();
    expect(env.sendBeacon).toHaveBeenCalledWith(CLIENT_ERRORS_PATH, "sw_register_failed");
  });

  it("checks for an update at most once an hour when the page becomes visible", async () => {
    const update = vi.fn(() => Promise.resolve());
    const { env } = stub({ register: vi.fn(() => Promise.resolve({ update })) });
    let time = 0;
    let visible: () => void = () => undefined;
    await registerServiceWorker({ ...env, now: () => time, onVisible: (listener) => (visible = listener) });

    time = UPDATE_CHECK_INTERVAL_MS - 1;
    visible();
    expect(update).not.toHaveBeenCalled();

    time = UPDATE_CHECK_INTERVAL_MS;
    visible();
    visible();
    expect(update).toHaveBeenCalledOnce();

    time = 2 * UPDATE_CHECK_INTERVAL_MS;
    visible();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("sends sw_update_failed when an update check rejects", async () => {
    const update = vi.fn(() => Promise.reject(new Error("offline")));
    const { env } = stub({ register: vi.fn(() => Promise.resolve({ update })) });
    let time = 0;
    let visible: () => void = () => undefined;
    await registerServiceWorker({ ...env, now: () => time, onVisible: (listener) => (visible = listener) });
    time = UPDATE_CHECK_INTERVAL_MS;
    visible();
    await vi.waitFor(() => {
      expect(env.sendBeacon).toHaveBeenCalledWith(CLIENT_ERRORS_PATH, "sw_update_failed");
    });
    expect(env.sendBeacon).toHaveBeenCalledOnce();
  });
});
