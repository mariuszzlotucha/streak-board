// Page side of the service worker (public/sw.js): registers it, shows the new-version message when a release takes
// over an open page, and reports registration and update failures to `POST /api/client-errors` as a fixed code only
// (never the error text or a URL). Registration runs only in a production build: in `astro dev` a worker would get in
// the way of HMR.

/** The codes `POST /api/client-errors` accepts; the server reports them as `client.sw.<code>`. */
export const CLIENT_ERROR_CODES = ["sw_register_failed", "sw_update_failed"] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export const CLIENT_ERRORS_PATH = "/api/client-errors";

/**
 * The update decision: a `controllerchange` is a new version only when a worker already controlled the page before it.
 * The first install (no previous controller, then `clients.claim()`) is not an update.
 */
export function isUpdate(previousController: unknown): boolean {
  return previousController !== null && previousController !== undefined;
}

/** The parts of the browser the registration uses, so a unit test can stub them. */
export interface PwaEnvironment {
  serviceWorker: Pick<ServiceWorkerContainer, "controller" | "register" | "addEventListener">;
  sendBeacon: (url: string, data: string) => boolean;
  showNotice: () => void;
  /** Calls `listener` when the page becomes visible again (a check for a new version). */
  onVisible?: (listener: () => void) => void;
  /** The clock for throttling update checks; `Date.now` by default. */
  now?: () => number;
}

/** The shortest gap between two update checks; registration itself counts as the first one. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Registers `/sw.js` and wires the message and the reports. Resolves once registration has settled. */
export async function registerServiceWorker(env: PwaEnvironment): Promise<void> {
  const report = (code: ClientErrorCode) => {
    env.sendBeacon(CLIENT_ERRORS_PATH, code);
  };
  let controller: unknown = env.serviceWorker.controller;
  env.serviceWorker.addEventListener("controllerchange", () => {
    if (isUpdate(controller)) env.showNotice();
    controller = env.serviceWorker.controller;
  });

  let registration: ServiceWorkerRegistration;
  try {
    registration = await env.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    report("sw_register_failed");
    return;
  }
  const now = env.now ?? Date.now;
  let lastCheck = now();
  env.onVisible?.(() => {
    if (now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = now();
    registration.update().catch(() => {
      report("sw_update_failed");
    });
  });
}

/** Wires the Refresh button and, in a production build with service worker support, registers the worker. */
export function startServiceWorker(): void {
  const notice = document.querySelector<HTMLElement>("[data-update-notice]");
  notice?.querySelector("[data-update-refresh]")?.addEventListener("click", () => {
    location.reload();
  });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  void registerServiceWorker({
    serviceWorker: navigator.serviceWorker,
    sendBeacon: (url, data) => navigator.sendBeacon(url, data),
    showNotice: () => notice?.removeAttribute("hidden"),
    onVisible: (listener) => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") listener();
      });
    },
  });
}
