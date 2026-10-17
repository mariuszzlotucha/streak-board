// Reminders on this device (S-16): detects whether Web Push can work here, asks for permission on a click, subscribes
// through the service worker (public/sw.js shows the notifications) and tells the server through
// `POST /api/reminders/{subscribe,unsubscribe,unsubscribe-all}`. Failures are reported like the worker's, as a fixed
// code to `POST /api/client-errors`, never the error text, the endpoint or the keys.
import { CLIENT_ERRORS_PATH, type ClientErrorCode } from "@/lib/pwa/register";

/** `unsupported`: no push here (or no server key); `denied`: the browser blocks notifications; else off or on. */
export type PushState = "unsupported" | "denied" | "off" | "on";

export const REMINDERS_PATHS = {
  subscribe: "/api/reminders/subscribe",
  unsubscribe: "/api/reminders/unsubscribe",
  unsubscribeAll: "/api/reminders/unsubscribe-all",
} as const;

type Subscription = Pick<PushSubscription, "endpoint" | "toJSON" | "unsubscribe">;

export interface PushManagerLike {
  getSubscription: () => Promise<Subscription | null>;
  subscribe: (options: { userVisibleOnly: boolean; applicationServerKey: BufferSource }) => Promise<Subscription>;
}

/** The parts of the browser this module uses, so a unit test can stub them (like `PwaEnvironment` in register.ts). */
export interface PushEnvironment {
  /** Undefined without `serviceWorker`, `PushManager` or `Notification`: push is unsupported. */
  push?: {
    permission: () => NotificationPermission;
    requestPermission: () => Promise<NotificationPermission>;
    /** The registration's push manager once the worker is active (`navigator.serviceWorker.ready`). */
    ready: () => Promise<PushManagerLike>;
    /** The current registration's push manager without waiting, or undefined when no worker is registered yet. */
    current: () => Promise<PushManagerLike | undefined>;
  };
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "ok">>;
  sendBeacon: (url: string, data: string) => boolean;
}

export interface PushOutcome {
  state: PushState;
  /** Set when the action failed; it has been reported. */
  error?: ClientErrorCode;
}

/** Decodes the base64url VAPID public key into the bytes `applicationServerKey` takes. */
export function decodeKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(key.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function report(env: PushEnvironment, code: ClientErrorCode): PushOutcome["error"] {
  env.sendBeacon(CLIENT_ERRORS_PATH, code);
  return code;
}

async function post(env: PushEnvironment, url: string, body?: unknown): Promise<boolean> {
  const response = await env.fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers:
      body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.ok;
}

/** The state of this device. Without a key, or without push in this browser, reminders are unsupported. */
export async function detectPushState(env: PushEnvironment, vapidPublicKey: string | null): Promise<PushState> {
  if (!vapidPublicKey || !env.push) return "unsupported";
  const permission = env.push.permission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";
  try {
    const manager = await env.push.current();
    const subscription = manager ? await manager.getSubscription() : null;
    return subscription ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Turns reminders on for this device: permission (on the click), a push subscription, then the server. */
export async function enablePush(env: PushEnvironment, vapidPublicKey: string | null): Promise<PushOutcome> {
  if (!vapidPublicKey || !env.push) return { state: "unsupported" };
  let permission: NotificationPermission;
  try {
    permission = await env.push.requestPermission();
  } catch {
    return { state: "off", error: report(env, "push_permission_failed") };
  }
  if (permission === "denied") return { state: "denied" };
  // Dismissed without a choice: nothing changed.
  if (permission !== "granted") return { state: "off" };

  let subscription: Subscription;
  try {
    const manager = await env.push.ready();
    subscription = await manager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(vapidPublicKey) });
  } catch {
    return { state: "off", error: report(env, "push_subscribe_failed") };
  }
  const json = subscription.toJSON();
  try {
    if (await post(env, REMINDERS_PATHS.subscribe, { endpoint: json.endpoint, keys: json.keys }))
      return { state: "on" };
  } catch {
    // Reported below, like a refused answer.
  }
  // The server does not know this subscription, so it would never be used: drop it locally as well.
  await subscription.unsubscribe().catch(() => false);
  return { state: "off", error: report(env, "push_save_failed") };
}

/** Turns reminders off for this device: the server forgets the endpoint first, then the browser drops it. */
export async function disablePush(env: PushEnvironment): Promise<PushOutcome> {
  if (!env.push) return { state: "unsupported" };
  try {
    const manager = await env.push.current();
    const subscription = manager ? await manager.getSubscription() : null;
    if (!subscription) return { state: "off" };
    if (!(await post(env, REMINDERS_PATHS.unsubscribe, { endpoint: subscription.endpoint }))) {
      return { state: "on", error: report(env, "push_unsubscribe_failed") };
    }
    await subscription.unsubscribe();
    return { state: "off" };
  } catch {
    return { state: "on", error: report(env, "push_unsubscribe_failed") };
  }
}

/** Turns reminders off on every device of the account, this one included. */
export async function disableAllPush(env: PushEnvironment, current: PushState): Promise<PushOutcome> {
  try {
    if (!(await post(env, REMINDERS_PATHS.unsubscribeAll))) {
      return { state: current, error: report(env, "push_unsubscribe_all_failed") };
    }
  } catch {
    return { state: current, error: report(env, "push_unsubscribe_all_failed") };
  }
  // The server holds no row any more; a local subscription left behind would only be a stale one.
  try {
    const manager = await env.push?.current();
    const subscription = manager ? await manager.getSubscription() : null;
    await subscription?.unsubscribe();
  } catch {
    // Nothing is sent to it any more.
  }
  return { state: current === "on" ? "off" : current };
}

/** The real browser, or an environment without `push` where Web Push is missing. */
export function browserPushEnvironment(): PushEnvironment {
  const supported =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window;
  return {
    push: supported
      ? {
          permission: () => Notification.permission,
          requestPermission: () => Notification.requestPermission(),
          ready: async () => (await navigator.serviceWorker.ready).pushManager,
          current: async () => (await navigator.serviceWorker.getRegistration())?.pushManager,
        }
      : undefined,
    fetch: (url, init) => fetch(url, init),
    sendBeacon: (url, data) => navigator.sendBeacon(url, data),
  };
}
