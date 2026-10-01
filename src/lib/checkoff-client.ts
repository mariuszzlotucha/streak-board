// The island's network protocol for a check-off or an undo, kept apart from React so it can be unit-tested without a
// DOM. Keep this file free of server-only imports so it is safe to bundle for the browser.
import type { PeriodKey } from "@/lib/streak-rules";

/** How long a tap may wait for the server (the bound of `PENDING_TIMEOUT_MS` in `useFormSubmitting`). */
export const CHECKOFF_TIMEOUT_MS = 15_000;

export type CheckoffAction = "checkoff" | "uncheck";

/**
 * - `saved`: the server recorded it for the period the island expected.
 * - `stale`: the server recorded it for another period (the page stayed open across Warsaw midnight): reload.
 * - `rejected`: the server says the action is not allowed or the task is gone (403, 404).
 * - `failed`: no usable answer: a network error, a timeout, a server error, a redirect or an unexpected body.
 */
export type CheckoffResult = { kind: "saved" } | { kind: "stale" } | { kind: "rejected" } | { kind: "failed" };

/**
 * Both routes are idempotent, so a retry after a false timeout is safe. The body is form-encoded, never JSON: Astro's
 * Origin check only guards requests with a form-like body, so a JSON body would opt out of CSRF protection.
 * `expectedPeriod` is null for a `once` task, which has no period to compare.
 */
export async function sendCheckoff(
  action: CheckoffAction,
  taskId: string,
  expectedPeriod: PeriodKey | null,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoffResult> {
  // Not `AbortSignal.timeout`: fake timers cannot drive it.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, CHECKOFF_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`/api/tasks/${action}`, {
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

    if (response.status === 403 || response.status === 404) return { kind: "rejected" };
    if (response.status !== 200) return { kind: "failed" };

    const body = (await response.json()) as { ok?: unknown; period?: unknown } | null;
    if (body?.ok !== true || typeof body.period !== "string") return { kind: "failed" };
    return expectedPeriod === null || body.period === expectedPeriod ? { kind: "saved" } : { kind: "stale" };
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
