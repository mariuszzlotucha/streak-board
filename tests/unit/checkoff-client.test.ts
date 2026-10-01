/**
 * Oracle for the island's network protocol (S-04, Phase 5): what `sendCheckoff` makes of every answer.
 *
 * Every expected value is derived by hand from the plan (context/changes/checkoff-and-leaderboard/plan.md, Phase 5 §1,
 * "Transport and Origin check" and "Timing") and from what the Phase 3 routes answer (src/lib/checkoff-response.ts):
 *
 *   request   POST, form-encoded `task_id` (never JSON: Astro's Origin check only guards form-like bodies), `Accept:
 *             application/json`, same-origin credentials, `redirect: "manual"` (an expired session answers 302 and must
 *             not be followed into the sign-in page), `keepalive` (the request outlives a navigation right after a tap)
 *   saved     200 `{ ok: true, period }` and the period is the one the island expected (a `once` task expects none)
 *   stale     200 `{ ok: true, period }` with another period: the page stayed open across Warsaw midnight, so reload
 *   rejected  403 or 404: the server says the action is not allowed, or the task is gone
 *   expired   a redirect: the middleware sends a signed-out request to the sign-in page, and a browser shows a manual
 *             redirect as an opaque response with status 0. Retrying cannot succeed, so the island reloads instead
 *   failed    everything else: a network error, no answer within 15 s, 5xx, a body that is not the JSON the routes send
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKOFF_TIMEOUT_MS, sendCheckoff } from "@/lib/checkoff-client";

const TODAY = "2026-10-02";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that records what it was called with and answers with `make(init)`. */
function respondWith(make: (init: RequestInit) => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = (input, init = {}) => {
    requests.push({ url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init });
    return Promise.resolve(make(init));
  };
  return { fetchImpl, requests };
}

const send = (response: Response | (() => Response | Promise<Response>), expectedPeriod: string | null = TODAY) =>
  sendCheckoff(
    "checkoff",
    "task-1",
    expectedPeriod,
    respondWith(() => (typeof response === "function" ? response() : response)).fetchImpl,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("sendCheckoff", () => {
  it("posts the task id form-encoded to the route of the action, asking for JSON", async () => {
    for (const action of ["checkoff", "uncheck"] as const) {
      const { fetchImpl, requests } = respondWith(() => json(200, { ok: true, period: TODAY }));

      await sendCheckoff(action, "task-1", TODAY, fetchImpl);

      expect(requests).toHaveLength(1);
      const [{ url, init }] = requests as [(typeof requests)[number]];
      expect(url).toBe(`/api/tasks/${action}`);
      expect(init.method).toBe("POST");
      expect(init.body).toBeInstanceOf(URLSearchParams);
      expect((init.body as URLSearchParams).get("task_id")).toBe("task-1");
      expect(new Headers(init.headers).get("Accept")).toBe("application/json");
      // No explicit Content-Type: the browser derives urlencoded from the URLSearchParams body, and a JSON type would
      // opt out of Astro's Origin check.
      expect(new Headers(init.headers).has("Content-Type")).toBe(false);
      expect(init.credentials).toBe("same-origin");
      expect(init.redirect).toBe("manual");
      expect(init.keepalive).toBe(true);
    }
  });

  it("is saved when the server confirms the expected period, and a once task accepts any period", async () => {
    await expect(send(json(200, { ok: true, period: TODAY }))).resolves.toEqual({ kind: "saved" });
    await expect(send(json(200, { ok: true, period: "2026-01-01" }), null)).resolves.toEqual({ kind: "saved" });
  });

  it("is stale when the server confirms a different period", async () => {
    await expect(send(json(200, { ok: true, period: "2026-10-03" }))).resolves.toEqual({ kind: "stale" });
  });

  it("is rejected when the server answers 403 or 404", async () => {
    await expect(send(json(403, { ok: false, error: "forbidden" }))).resolves.toEqual({ kind: "rejected" });
    await expect(send(json(404, { ok: false, error: "gone" }))).resolves.toEqual({ kind: "rejected" });
  });

  it("is expired when the route answers a redirect, which a browser shows as an opaque redirect", async () => {
    const opaqueRedirect = { type: "opaqueredirect", status: 0, ok: false } as unknown as Response;

    await expect(send(new Response(null, { status: 302, headers: { Location: "/auth/signin" } }))).resolves.toEqual({
      kind: "expired",
    });
    await expect(send(opaqueRedirect)).resolves.toEqual({ kind: "expired" });
  });

  it.each<[string, () => Response | Promise<Response>]>([
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a 500 server error", () => json(500, { ok: false, error: "unknown" })],
    ["a 503 (not configured)", () => json(503, { ok: false, error: "not_configured" })],
    ["a 400 (malformed id)", () => json(400, { ok: false, error: "invalid" })],
    ["a 500 that carries an ok body", () => json(500, { ok: true, period: TODAY })],
    [
      "an HTML page with status 200",
      () => new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    ],
    ["a 200 that says ok is false", () => json(200, { ok: false, error: "forbidden" })],
    ["a 200 without a period", () => json(200, { ok: true })],
    ["a 200 with an empty object", () => json(200, {})],
  ])("fails on %s", async (_answer, respond) => {
    await expect(send(respond)).resolves.toEqual({ kind: "failed" });
  });

  it("fails when no answer comes within 15 seconds, and aborts the request", async () => {
    expect(CHECKOFF_TIMEOUT_MS).toBe(15_000);
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const { fetchImpl } = respondWith((init) => {
      signal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    let settled = false;
    const result = sendCheckoff("checkoff", "task-1", TODAY, fetchImpl);
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: "failed" });
    expect(signal?.aborted).toBe(true);
  });

  it("leaves no timer behind once the request has settled", async () => {
    vi.useFakeTimers();

    await send(json(200, { ok: true, period: TODAY }));
    expect(vi.getTimerCount()).toBe(0);

    await send(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(vi.getTimerCount()).toBe(0);
  });
});
