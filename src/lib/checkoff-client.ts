// The island's network protocol for a check-off or an undo, kept apart from React so it can be unit-tested without a
// DOM. Keep this file free of server-only imports so it is safe to bundle for the browser.
import { CLIENT_ERRORS_PATH, type ClientErrorCode } from "@/lib/client-error-codes";
import type { PeriodKey } from "@/lib/streak-rules";

/** How long one attempt may wait for the server (the bound of `PENDING_TIMEOUT_MS` in `useFormSubmitting`); a tap makes at most two. */
export const CHECKOFF_TIMEOUT_MS = 15_000;

export type CheckoffAction = "checkoff" | "uncheck";

/**
 * - `saved`: the server recorded it for the period the island expected.
 * - `stale`: the server recorded it for another period (the page stayed open across Warsaw midnight): reload.
 * - `rejected`: the server says the action is not allowed or the task is gone (403, 404).
 * - `expired`: the route answered a redirect (the middleware sends a signed-out request to the sign-in page): a retry
 *   cannot succeed, so reload.
 * - `failed`: no usable answer after the attempts; `reason` says why (see `CheckoffFailureReason`).
 */
export type CheckoffSendResult =
  | { kind: "saved" }
  | { kind: "stale" }
  | { kind: "rejected" }
  | { kind: "expired" }
  | { kind: "failed"; reason: CheckoffFailureReason };

/**
 * Why a request failed:
 * - `network`: the fetch threw before a response arrived (offline, a dropped connection), or the connection dropped while
 *   the body was read.
 * - `timeout`: no answer within `CHECKOFF_TIMEOUT_MS`, before or while the body was read.
 * - `status`: something answered other than 200, a redirect, 403 or 404. The route logs its own failures; an answer
 *   from the edge that never reached the route (a 429, a Worker exception page) leaves no trace, a known limit.
 * - `body`: a 200 whose body is not `{ ok: true, period }`, or is not JSON at all.
 */
export type CheckoffFailureReason = "network" | "timeout" | "status" | "body";

/** The client-error code that reports a failure to the operator, or null for `status`, which the route logs itself. */
export function checkoffFailureCode(action: CheckoffAction, reason: CheckoffFailureReason): ClientErrorCode | null {
  if (reason === "status") return null;
  return reason === "timeout" ? `${action}_timeout` : `${action}_failed`;
}

function defaultBeacon(url: string, data: string): boolean {
  return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
    ? navigator.sendBeacon(url, data)
    : false;
}

/** Reports a failure the island has given up on as a bare code (never the error text or the task) through a beacon. */
export function reportCheckoffFailure(
  code: ClientErrorCode,
  beacon: (url: string, data: string) => boolean = defaultBeacon,
): void {
  beacon(CLIENT_ERRORS_PATH, code);
}

async function attemptCheckoff(
  action: CheckoffAction,
  taskId: string,
  expectedPeriod: PeriodKey | null,
  fetchImpl: typeof fetch,
): Promise<CheckoffSendResult> {
  // Not `AbortSignal.timeout`: fake timers cannot drive it.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, CHECKOFF_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetchImpl(`/api/tasks/${action}`, {
        method: "POST",
        body: new URLSearchParams({ task_id: taskId }),
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        // An expired session answers 302 to the sign-in page; following it would end in a 200 HTML page.
        redirect: "manual",
        // The request outlives a navigation right after the tap.
        keepalive: true,
        signal: controller.signal,
      });
    } catch {
      // The signal, not the error's name, tells our abort from a thrown fetch: browsers differ in what they throw.
      return { kind: "failed", reason: controller.signal.aborted ? "timeout" : "network" };
    }

    // A browser reports a `redirect: "manual"` redirect as an opaque response (status 0); other runtimes keep the 3xx.
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      return { kind: "expired" };
    }
    if (response.status === 403 || response.status === 404) return { kind: "rejected" };
    if (response.status !== 200) return { kind: "failed", reason: "status" };

    let body: { ok?: unknown; period?: unknown } | null;
    try {
      body = (await response.json()) as { ok?: unknown; period?: unknown } | null;
    } catch (error) {
      // Our own abort is a timeout, and a body that is not JSON (a SyntaxError) is final. Any other rejection is the
      // connection dropping mid-body: the route may have saved the row, so it is a `network` failure and goes again.
      if (controller.signal.aborted) return { kind: "failed", reason: "timeout" };
      return { kind: "failed", reason: error instanceof SyntaxError ? "body" : "network" };
    }
    if (body?.ok !== true || typeof body.period !== "string") return { kind: "failed", reason: "body" };
    return expectedPeriod === null || body.period === expectedPeriod ? { kind: "saved" } : { kind: "stale" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Both routes are idempotent, so a second attempt after a false timeout is safe: a request that got no answer at all
 * (`network`, `timeout`) is sent again at once, up to `attempts` times, each with its own 15 s abort; the result is the
 * last attempt's. Anything the server answered, or a body that is not the JSON the routes send, is final. The body is
 * form-encoded, never JSON: Astro's Origin check only guards requests with a form-like body, so a JSON body would opt
 * out of CSRF protection. `expectedPeriod` is null for a `once` task, which has no period to compare. `shouldRetry` is
 * asked before every further attempt: the island says no once a newer tap has started, because resending an old action
 * after the newer one would leave the server in the old state.
 */
export async function sendCheckoff(
  action: CheckoffAction,
  taskId: string,
  expectedPeriod: PeriodKey | null,
  fetchImpl: typeof fetch = fetch,
  attempts = 2,
  shouldRetry: () => boolean = () => true,
): Promise<CheckoffSendResult> {
  let result = await attemptCheckoff(action, taskId, expectedPeriod, fetchImpl);
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (result.kind !== "failed" || (result.reason !== "network" && result.reason !== "timeout")) break;
    if (!shouldRetry()) break;
    result = await attemptCheckoff(action, taskId, expectedPeriod, fetchImpl);
  }
  return result;
}
