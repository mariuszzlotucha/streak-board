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
 *   failed    everything else: a network error, no answer within 15 s, 5xx, a redirect (browsers show a manual redirect
 *             as an opaque response with status 0), a body that is not the JSON the routes send
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

const send = (response: Response | (() => Promise<Response>), expectedPeriod: string | null = TODAY) =>
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

  it("fails on a network error, a server error, a redirect, an opaque redirect and a body that is not the JSON answer", async () => {
    const opaqueRedirect = { type: "opaqueredirect", status: 0, ok: false } as unknown as Response;
    const answers: (Response | (() => Promise<Response>))[] = [
      () => Promise.reject(new TypeError("Failed to fetch")),
      json(500, { ok: false, error: "unknown" }),
      json(503, { ok: false, error: "not_configured" }),
      json(400, { ok: false, error: "invalid" }),
      json(500, { ok: true, period: TODAY }),
      new Response(null, { status: 302, headers: { Location: "/auth/signin" } }),
      opaqueRedirect,
      new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      json(200, { ok: false, error: "forbidden" }),
      json(200, { ok: true }),
      json(200, {}),
    ];

    for (const answer of answers) {
      await expect(send(answer)).resolves.toEqual({ kind: "failed" });
    }
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
