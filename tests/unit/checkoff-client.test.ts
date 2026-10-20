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
 *   failed    everything else, with the reason: `network` (the fetch threw), `timeout` (no answer within 15 s), `status`
 *             (any other status, 5xx included) or `body` (a 200 that is not the JSON the routes send)
 *   retry     S-22: a request with no server answer (`network`, `timeout`) is sent once more at once, each attempt with
 *             its own 15 s abort, so the worst case is 30 s; what the server answered, and a bad body, is never retried
 *   code      `checkoffFailureCode` picks the client-error code from the action and the reason (`status` has none: the
 *             route logged it); `reportCheckoffFailure` sends it as a bare code to `/api/client-errors`
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERRORS_PATH } from "@/lib/client-error-codes";
import {
  CHECKOFF_TIMEOUT_MS,
  checkoffFailureCode,
  reportCheckoffFailure,
  sendCheckoff,
  type CheckoffFailureReason,
} from "@/lib/checkoff-client";

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
  vi.unstubAllGlobals();
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

  it.each<[string, CheckoffFailureReason, () => Response | Promise<Response>]>([
    ["a 500 server error", "status", () => json(500, { ok: false, error: "unknown" })],
    ["a 503 (not configured)", "status", () => json(503, { ok: false, error: "not_configured" })],
    ["a 400 (malformed id)", "status", () => json(400, { ok: false, error: "invalid" })],
    ["a 500 that carries an ok body", "status", () => json(500, { ok: true, period: TODAY })],
    [
      "an HTML page with status 200",
      "body",
      () => new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    ],
    ["a 200 that says ok is false", "body", () => json(200, { ok: false, error: "forbidden" })],
    ["a 200 without a period", "body", () => json(200, { ok: true })],
    ["a 200 with an empty object", "body", () => json(200, {})],
    ["a 200 with a null body", "body", () => json(200, null)],
  ])("fails on %s with the reason %s, and does not retry", async (_answer, reason, respond) => {
    const { fetchImpl, requests } = respondWith(respond);

    await expect(sendCheckoff("checkoff", "task-1", TODAY, fetchImpl)).resolves.toEqual({ kind: "failed", reason });
    expect(requests).toHaveLength(1);
  });

  it("sends the request again after a thrown fetch, and is saved when the second attempt succeeds", async () => {
    let calls = 0;
    const { fetchImpl, requests } = respondWith(() =>
      ++calls === 1 ? Promise.reject(new TypeError("Failed to fetch")) : json(200, { ok: true, period: TODAY }),
    );

    await expect(sendCheckoff("checkoff", "task-1", TODAY, fetchImpl)).resolves.toEqual({ kind: "saved" });
    expect(requests).toHaveLength(2);
    // Each attempt carries the same request, with a signal of its own.
    expect(requests.map((request) => request.url)).toEqual(["/api/tasks/checkoff", "/api/tasks/checkoff"]);
    expect(requests[0]?.init.signal).not.toBe(requests[1]?.init.signal);
  });

  it("fails with the reason network after two thrown fetches", async () => {
    const { fetchImpl, requests } = respondWith(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(sendCheckoff("checkoff", "task-1", TODAY, fetchImpl)).resolves.toEqual({
      kind: "failed",
      reason: "network",
    });
    expect(requests).toHaveLength(2);
  });

  it("makes a single attempt when told to", async () => {
    const { fetchImpl, requests } = respondWith(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(sendCheckoff("checkoff", "task-1", TODAY, fetchImpl, 1)).resolves.toEqual({
      kind: "failed",
      reason: "network",
    });
    expect(requests).toHaveLength(1);
  });

  it("asks before the second attempt and stops when the caller says no", async () => {
    const vetoed = respondWith(() => Promise.reject(new TypeError("Failed to fetch")));
    const no = vi.fn(() => false);

    await expect(sendCheckoff("checkoff", "task-1", TODAY, vetoed.fetchImpl, 2, no)).resolves.toEqual({
      kind: "failed",
      reason: "network",
    });
    expect(vetoed.requests).toHaveLength(1);
    expect(no).toHaveBeenCalledOnce();

    let calls = 0;
    const allowed = respondWith(() =>
      ++calls === 1 ? Promise.reject(new TypeError("Failed to fetch")) : json(200, { ok: true, period: TODAY }),
    );
    const yes = vi.fn(() => true);

    await expect(sendCheckoff("checkoff", "task-1", TODAY, allowed.fetchImpl, 2, yes)).resolves.toEqual({
      kind: "saved",
    });
    expect(allowed.requests).toHaveLength(2);
    expect(yes).toHaveBeenCalledOnce();
  });

  it("does not ask when there is nothing to retry", async () => {
    const shouldRetry = vi.fn(() => true);
    const { fetchImpl, requests } = respondWith(() => json(500, { ok: false, error: "unknown" }));

    await expect(sendCheckoff("checkoff", "task-1", TODAY, fetchImpl, 2, shouldRetry)).resolves.toEqual({
      kind: "failed",
      reason: "status",
    });
    expect(requests).toHaveLength(1);
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it("does not resend after a timeout when the caller says no", async () => {
    vi.useFakeTimers();
    const { fetchImpl, requests } = respondWith(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const result = sendCheckoff("checkoff", "task-1", TODAY, fetchImpl, 2, () => false);

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toEqual({ kind: "failed", reason: "timeout" });
    expect(requests).toHaveLength(1);
  });

  /** A fetch that never answers and rejects when its request is aborted, like a browser's. */
  function hangingFetch(answers: (call: number) => Response | undefined = () => undefined) {
    const signals: (AbortSignal | null | undefined)[] = [];
    const starts: number[] = [];
    const { fetchImpl } = respondWith((init) => {
      signals.push(init.signal);
      starts.push(Date.now());
      const answer = answers(signals.length);
      if (answer) return answer;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    return { fetchImpl, signals, starts };
  }

  it("fails with the reason timeout when no answer comes within 15 seconds, after a second attempt of its own", async () => {
    expect(CHECKOFF_TIMEOUT_MS).toBe(15_000);
    vi.useFakeTimers();
    const { fetchImpl, signals, starts } = hangingFetch();
    let settled = false;
    const result = sendCheckoff("checkoff", "task-1", TODAY, fetchImpl);
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(14_999);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    // The first abort starts the second attempt at once.
    await vi.advanceTimersByTimeAsync(1);
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(starts[1] - starts[0]).toBe(15_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: "failed", reason: "timeout" });
    expect(signals[1]?.aborted).toBe(true);
    expect(signals).toHaveLength(2);
    expect(starts[1] - starts[0]).toBe(15_000);
  });

  it("is saved when the first attempt times out and the second is answered", async () => {
    vi.useFakeTimers();
    const { fetchImpl, signals, starts } = hangingFetch((call) =>
      call === 2 ? json(200, { ok: true, period: TODAY }) : undefined,
    );
    const result = sendCheckoff("checkoff", "task-1", TODAY, fetchImpl);

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(result).resolves.toEqual({ kind: "saved" });
    expect(signals).toHaveLength(2);
    expect(starts[1] - starts[0]).toBe(15_000);
  });

  it("counts an abort while the body is read as a timeout, and a body that does not parse as a body failure", async () => {
    vi.useFakeTimers();
    const stalledBody = (init: RequestInit) => {
      const response = new Response("{}", { status: 200 });
      vi.spyOn(response, "json").mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );
      return response;
    };
    const { fetchImpl, requests } = respondWith(stalledBody);
    const result = sendCheckoff("checkoff", "task-1", TODAY, fetchImpl);

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toEqual({ kind: "failed", reason: "timeout" });
    expect(requests).toHaveLength(2);
  });

  it("retries a body cut off by the connection, and reports it as a network failure when it stays cut", async () => {
    const cutBody = () => {
      const response = new Response("{}", { status: 200 });
      vi.spyOn(response, "json").mockRejectedValue(new TypeError("network error"));
      return response;
    };
    const cut = respondWith(cutBody);

    await expect(sendCheckoff("checkoff", "task-1", TODAY, cut.fetchImpl)).resolves.toEqual({
      kind: "failed",
      reason: "network",
    });
    expect(cut.requests).toHaveLength(2);

    let calls = 0;
    const recovering = respondWith(() => (++calls === 1 ? cutBody() : json(200, { ok: true, period: TODAY })));

    await expect(sendCheckoff("checkoff", "task-1", TODAY, recovering.fetchImpl)).resolves.toEqual({ kind: "saved" });
    expect(recovering.requests).toHaveLength(2);
  });

  it("leaves no timer behind once the request has settled", async () => {
    vi.useFakeTimers();

    await send(json(200, { ok: true, period: TODAY }));
    expect(vi.getTimerCount()).toBe(0);

    await send(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("checkoffFailureCode", () => {
  it.each<["checkoff" | "uncheck", CheckoffFailureReason, string | null]>([
    ["checkoff", "network", "checkoff_failed"],
    ["checkoff", "body", "checkoff_failed"],
    ["checkoff", "timeout", "checkoff_timeout"],
    ["checkoff", "status", null],
    ["uncheck", "network", "uncheck_failed"],
    ["uncheck", "body", "uncheck_failed"],
    ["uncheck", "timeout", "uncheck_timeout"],
    ["uncheck", "status", null],
  ])("maps %s and %s to %s", (action, reason, code) => {
    expect(checkoffFailureCode(action, reason)).toBe(code);
  });
});

describe("reportCheckoffFailure", () => {
  it("hands the bare code to the beacon with the client-error path", () => {
    const beacon = vi.fn(() => true);

    reportCheckoffFailure("uncheck_timeout", beacon);

    expect(beacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "uncheck_timeout");
  });

  it("sends through the browser's sendBeacon by default", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });

    reportCheckoffFailure("checkoff_timeout");

    expect(sendBeacon).toHaveBeenCalledExactlyOnceWith(CLIENT_ERRORS_PATH, "checkoff_timeout");
  });

  it("does nothing without a browser to send from", () => {
    expect(() => {
      reportCheckoffFailure("checkoff_failed");
    }).not.toThrow();
  });
});
