import { describe, expect, it, vi } from "vitest";
import {
  REMINDERS_PATHS,
  decodeKey,
  detectPushState,
  disableAllPush,
  disablePush,
  enablePush,
  type PushEnvironment,
  type PushManagerLike,
} from "@/lib/pwa/push";
import { CLIENT_ERRORS_PATH, CLIENT_ERROR_CODES } from "@/lib/pwa/register";

const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const ENDPOINT = "https://push.example/abc";

function subscription() {
  return {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  };
}

interface SetupOptions {
  permission?: NotificationPermission;
  requested?: NotificationPermission;
  existing?: ReturnType<typeof subscription> | null;
  registered?: boolean;
  ok?: boolean;
  redirected?: boolean;
  subscribeFails?: boolean;
}

function setup({
  permission = "default",
  requested = "granted",
  existing = null,
  registered = true,
  ok = true,
  redirected = false,
  subscribeFails = false,
}: SetupOptions = {}) {
  const created = subscription();
  const manager = {
    getSubscription: vi.fn(() => Promise.resolve(existing)),
    subscribe: vi.fn(() => (subscribeFails ? Promise.reject(new Error("no")) : Promise.resolve(created))),
  } satisfies PushManagerLike;
  const fetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve({ ok, redirected }));
  const sendBeacon = vi.fn((_url: string, _data: string) => true);
  const env: PushEnvironment = {
    push: {
      permission: () => permission,
      requestPermission: vi.fn(() => Promise.resolve(requested)),
      ready: () => Promise.resolve(manager),
      current: () => Promise.resolve(registered ? manager : undefined),
    },
    fetch,
    sendBeacon,
  };
  return { env, manager, created, fetch, sendBeacon };
}

describe("push failure codes", () => {
  it("are accepted by POST /api/client-errors", () => {
    for (const code of [
      "push_permission_failed",
      "push_subscribe_failed",
      "push_save_failed",
      "push_unsubscribe_failed",
      "push_unsubscribe_all_failed",
    ]) {
      expect(CLIENT_ERROR_CODES).toContain(code);
    }
  });
});

describe("decodeKey", () => {
  it("decodes a base64url P-256 public key into 65 bytes starting with 0x04", () => {
    const bytes = decodeKey(KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe("detectPushState", () => {
  it("is unsupported without a key or without push in the browser", async () => {
    expect(await detectPushState(setup().env, null)).toBe("unsupported");
    expect(await detectPushState(setup().env, "")).toBe("unsupported");
    expect(await detectPushState({ ...setup().env, push: undefined }, KEY)).toBe("unsupported");
  });

  it("is denied when notifications are blocked", async () => {
    expect(await detectPushState(setup({ permission: "denied" }).env, KEY)).toBe("denied");
  });

  it("is off before permission, without a worker, or without a subscription", async () => {
    expect(await detectPushState(setup({ permission: "default", existing: subscription() }).env, KEY)).toBe("off");
    expect(await detectPushState(setup({ permission: "granted", registered: false }).env, KEY)).toBe("off");
    expect(await detectPushState(setup({ permission: "granted" }).env, KEY)).toBe("off");
  });

  it("is on with permission and a subscription", async () => {
    expect(await detectPushState(setup({ permission: "granted", existing: subscription() }).env, KEY)).toBe("on");
  });
});

describe("enablePush", () => {
  it("asks permission, subscribes with the key and posts the subscription", async () => {
    const { env, manager, fetch, sendBeacon } = setup();
    expect(await enablePush(env, KEY)).toEqual({ state: "on" });
    expect(env.push?.requestPermission).toHaveBeenCalledOnce();
    expect(manager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: decodeKey(KEY) });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(REMINDERS_PATHS.subscribe);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("ends denied, or off when dismissed, without subscribing", async () => {
    const denied = setup({ requested: "denied" });
    expect(await enablePush(denied.env, KEY)).toEqual({ state: "denied" });
    expect(denied.manager.subscribe).not.toHaveBeenCalled();
    const dismissed = setup({ requested: "default" });
    expect(await enablePush(dismissed.env, KEY)).toEqual({ state: "off" });
    expect(dismissed.manager.subscribe).not.toHaveBeenCalled();
  });

  it("reports push_subscribe_failed when the browser refuses the subscription", async () => {
    const { env, fetch, sendBeacon } = setup({ subscribeFails: true });
    expect(await enablePush(env, KEY)).toEqual({ state: "off", error: "push_subscribe_failed" });
    expect(fetch).not.toHaveBeenCalled();
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "push_subscribe_failed");
  });

  it("reports push_save_failed and drops the local subscription when the server refuses it", async () => {
    const { env, created, sendBeacon } = setup({ ok: false });
    expect(await enablePush(env, KEY)).toEqual({ state: "off", error: "push_save_failed" });
    expect(created.unsubscribe).toHaveBeenCalledOnce();
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "push_save_failed");
  });

  it("reports push_save_failed when the save is redirected to another page", async () => {
    const { env, created, sendBeacon } = setup({ redirected: true });
    expect(await enablePush(env, KEY)).toEqual({ state: "off", error: "push_save_failed" });
    expect(created.unsubscribe).toHaveBeenCalledOnce();
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "push_save_failed");
  });

  it("is unsupported without a key", async () => {
    const { env } = setup();
    expect(await enablePush(env, null)).toEqual({ state: "unsupported" });
    expect(env.push?.requestPermission).not.toHaveBeenCalled();
  });
});

describe("disablePush", () => {
  it("tells the server the endpoint, then unsubscribes locally", async () => {
    const existing = subscription();
    const { env, fetch } = setup({ permission: "granted", existing });
    expect(await disablePush(env)).toEqual({ state: "off" });
    expect(fetch.mock.calls[0][0]).toBe(REMINDERS_PATHS.unsubscribe);
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ endpoint: ENDPOINT });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("stays on and reports push_unsubscribe_failed when the server refuses", async () => {
    const existing = subscription();
    const { env, sendBeacon } = setup({ permission: "granted", existing, ok: false });
    expect(await disablePush(env)).toEqual({ state: "on", error: "push_unsubscribe_failed" });
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "push_unsubscribe_failed");
  });

  it("is off with no subscription and posts nothing", async () => {
    const { env, fetch } = setup({ permission: "granted" });
    expect(await disablePush(env)).toEqual({ state: "off" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("disableAllPush", () => {
  it("posts unsubscribe-all with no body and drops the local subscription", async () => {
    const existing = subscription();
    const { env, fetch } = setup({ permission: "granted", existing });
    expect(await disableAllPush(env, "on")).toEqual({ state: "off" });
    expect(fetch.mock.calls[0][0]).toBe(REMINDERS_PATHS.unsubscribeAll);
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("keeps a denied or unsupported state", async () => {
    expect(await disableAllPush(setup({ permission: "denied" }).env, "denied")).toEqual({ state: "denied" });
    expect(await disableAllPush({ ...setup().env, push: undefined }, "unsupported")).toEqual({ state: "unsupported" });
  });

  it("reports push_unsubscribe_all_failed and keeps the state when the server refuses", async () => {
    const existing = subscription();
    const { env, sendBeacon } = setup({ permission: "granted", existing, ok: false });
    expect(await disableAllPush(env, "on")).toEqual({ state: "on", error: "push_unsubscribe_all_failed" });
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "push_unsubscribe_all_failed");
  });
});
