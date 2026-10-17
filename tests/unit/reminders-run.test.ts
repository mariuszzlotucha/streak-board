/**
 * Oracle for the reminder send loop (S-16, plan Phase 3): the outcome mapping of push-service answers, the RPC calls,
 * the bounded concurrency and that no endpoint ever reaches a log line. 2026-10-04 18:00Z is Sunday 20:00 CEST, so the
 * run is due with today 2026-10-04 and the week of Monday 2026-09-28; 2026-10-03 18:00Z is Saturday, no week.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  MAX_LISTED_TASKS,
  reminderPayload,
  runReminders,
  SEND_CONCURRENCY,
  sendOutcome,
  sendReminder,
  type ReminderEnv,
} from "@/lib/reminders/run";
import { base64UrlEncode } from "@/lib/reminders/web-push";
import type { createAnonClient } from "@/lib/supabase-anon";

type AnonClient = ReturnType<typeof createAnonClient>;

const sunday = new Date("2026-10-04T18:00:00Z");
const saturday = new Date("2026-10-03T18:00:00Z");
const SECRET = "s".repeat(40);

// A real browser-side key pair, so the encryption in the loop runs for real.
const uaPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const p256dh = base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", uaPair.publicKey)));
const auth = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));

const vapidPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const env: ReminderEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "anon-key",
  REMINDER_SECRET: SECRET,
  VAPID_PUBLIC_KEY: base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", vapidPair.publicKey))),
  VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey("jwk", vapidPair.privateKey)).d ?? "",
  CONTACT_EMAIL: "owner@example.com",
};

function row(i: number, names = [`Task ${i}`]) {
  return { endpoint: `https://push.example.com/sub-${i}`, p256dh, auth, task_names: names };
}

interface RpcResult {
  data: unknown;
  error: unknown;
}

function client(due: RpcResult, prune: RpcResult = { data: null, error: null }) {
  const rpc = vi.fn((name: string) => Promise.resolve(name === "due_reminders" ? due : prune));
  return { rpc, factory: vi.fn(() => ({ rpc }) as unknown as AnonClient) };
}

/** A fetch that answers each endpoint with the status in `statuses` (by sub index), or throws for "throw". */
function pushService(statuses: (number | "throw")[]) {
  return vi.fn((request: Request) => {
    const index = Number(/sub-(\d+)$/.exec(request.url)?.[1]);
    const status = statuses[index];
    if (status === "throw") return Promise.reject(new TypeError(`fetch failed for ${request.url}`));
    return Promise.resolve(new Response(null, { status }));
  });
}

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

function events(spy: MockInstance<typeof console.error> | MockInstance<typeof console.info>): string[] {
  return spy.mock.calls.map(([line]) => (line as { event: string }).event);
}

function allLogText(): string {
  return JSON.stringify([...errorSpy.mock.calls, ...infoSpy.mock.calls]);
}

describe("sendOutcome", () => {
  it.each([
    [200, "sent"],
    [201, "sent"],
    [299, "sent"],
    [404, "expired"],
    [410, "expired"],
    [199, "failed"],
    [300, "failed"],
    [400, "failed"],
    [403, "failed"],
    [413, "failed"],
    [429, "failed"],
    [500, "failed"],
  ])("maps %i to %s", (status, outcome) => {
    expect(sendOutcome(status)).toBe(outcome);
  });
});

describe("reminderPayload", () => {
  it("lists the task titles in one line that opens the dashboard", () => {
    expect(JSON.parse(reminderPayload(["Run", "Read"]))).toEqual({
      title: "StreakBoard",
      body: "Still to do today: Run, Read",
      url: "/dashboard",
    });
  });

  it("keeps the same wording when Sunday adds weekly titles to the list", () => {
    expect((JSON.parse(reminderPayload(["Run", "Weekly review"])) as { body: string }).body).toBe(
      "Still to do today: Run, Weekly review",
    );
  });

  it("names five titles and counts the rest", () => {
    const titles = ["A", "B", "C", "D", "E", "F", "G"];
    expect(MAX_LISTED_TASKS).toBe(5);
    expect((JSON.parse(reminderPayload(titles.slice(0, 5))) as { body: string }).body).toBe(
      "Still to do today: A, B, C, D, E",
    );
    expect((JSON.parse(reminderPayload(titles)) as { body: string }).body).toBe(
      "Still to do today: A, B, C, D, E and 2 more",
    );
  });

  it("stays under the push payload limit with the longest titles", () => {
    const longest = Array.from({ length: 50 }, () => "Ż".repeat(80));
    expect(new TextEncoder().encode(reminderPayload(longest)).length).toBeLessThan(1500);
  });
});

describe("runReminders", () => {
  it("sends, prunes 404 and 410, reports other failures and logs the counts", async () => {
    const { rpc, factory } = client({ data: [0, 1, 2, 3, 4, 5].map((i) => row(i)), error: null });
    const fetch = pushService([200, 201, 404, 410, 500, "throw"]);

    const summary = await runReminders(env, sunday, { fetch, createClient: factory });

    expect(summary).toEqual({
      due: true,
      today: "2026-10-04",
      week: "2026-09-28",
      outcome: "done",
      subscriptions: 6,
      sent: 2,
      pruned: 2,
      failed: 2,
    });
    expect(factory).toHaveBeenCalledWith(env.SUPABASE_URL, env.SUPABASE_KEY);
    expect(rpc).toHaveBeenCalledWith("due_reminders", {
      p_secret: SECRET,
      p_today: "2026-10-04",
      p_week: "2026-09-28",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    // Sends run concurrently, so expired endpoints arrive in completion order; only the set matters to the prune.
    const [pruneName, pruneArgs] = rpc.mock.calls[1] as unknown as [
      string,
      { p_secret: string; p_endpoints: string[] },
    ];
    expect(pruneName).toBe("prune_push_subscriptions");
    expect(pruneArgs.p_secret).toBe(SECRET);
    expect([...pruneArgs.p_endpoints].sort()).toEqual([
      "https://push.example.com/sub-2",
      "https://push.example.com/sub-3",
    ]);
    expect(fetch).toHaveBeenCalledTimes(6);

    expect(events(errorSpy)).toEqual(["reminders.send.failed", "reminders.send.failed"]);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "reminders.send.failed", status: 500 }));
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "reminders.send.failed", status: null }));
    expect(events(infoSpy).filter((e) => e === "reminders.subscription.expired")).toHaveLength(2);
    expect(infoSpy).toHaveBeenCalledWith({
      level: "info",
      event: "reminders.run.done",
      subscriptions: 6,
      sent: 2,
      pruned: 2,
      failed: 2,
    });
    expect(allLogText()).not.toContain("push.example.com");
    expect(allLogText()).not.toContain(p256dh);
    expect(allLogText()).not.toContain("owner@example.com");
  });

  it("sends the encrypted reminder with the push headers", async () => {
    const { factory } = client({ data: [row(0, ["Run", "Read"])], error: null });
    const fetch = pushService([201]);

    await runReminders(env, sunday, { fetch, createClient: factory });

    const request = fetch.mock.calls[0][0];
    expect(request.method).toBe("POST");
    expect(request.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(request.headers.get("TTL")).toBe("14400");
    expect(request.headers.get("Authorization")).toMatch(new RegExp(`^vapid t=.+, k=${env.VAPID_PUBLIC_KEY ?? ""}$`));
  });

  it("passes a null week outside Sunday and does not prune when nothing expired", async () => {
    const { rpc, factory } = client({ data: [row(0)], error: null });

    const summary = await runReminders(env, saturday, { fetch: pushService([200]), createClient: factory });

    expect(rpc).toHaveBeenCalledWith("due_reminders", { p_secret: SECRET, p_today: "2026-10-03", p_week: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ outcome: "done", subscriptions: 1, sent: 1, pruned: 0, failed: 0 });
  });

  it("finishes with zero counts when nothing is due", async () => {
    const { rpc, factory } = client({ data: [], error: null });
    const fetch = pushService([]);

    const summary = await runReminders(env, sunday, { fetch, createClient: factory });

    expect(summary).toMatchObject({ outcome: "done", subscriptions: 0, sent: 0, pruned: 0, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("aborts the run when due_reminders fails", async () => {
    const { rpc, factory } = client({ data: null, error: { code: "42501", message: "invalid reminder secret" } });
    const fetch = pushService([]);

    const summary = await runReminders(env, sunday, { fetch, createClient: factory });

    expect(summary).toEqual({ due: true, today: "2026-10-04", week: "2026-09-28", outcome: "due_failed" });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "reminders.due.failed",
        error: expect.objectContaining({ code: "42501" }) as unknown,
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(events(infoSpy)).not.toContain("reminders.run.done");
  });

  it("reports a failed prune and counts nothing as pruned", async () => {
    const { factory } = client(
      { data: [row(0)], error: null },
      { data: null, error: { code: "42501", message: "invalid reminder secret" } },
    );

    const summary = await runReminders(env, sunday, { fetch: pushService([410]), createClient: factory });

    expect(summary).toMatchObject({ sent: 0, pruned: 0, failed: 0 });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "reminders.prune.failed", count: 1 }));
  });

  it.each([
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "REMINDER_SECRET",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "CONTACT_EMAIL",
  ])("skips the run when %s is missing", async (name) => {
    const { factory } = client({ data: [row(0)], error: null });
    const fetch = pushService([200]);

    const summary = await runReminders({ ...env, [name]: undefined }, sunday, { fetch, createClient: factory });

    expect(summary).toMatchObject({ outcome: "config_missing" });
    expect(factory).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "reminders.config.missing", missing: name }));
    expect(allLogText()).not.toContain(SECRET);
  });

  it("does nothing outside the 20:00 Warsaw hour", async () => {
    const { factory } = client({ data: [row(0)], error: null });

    await expect(
      runReminders(env, new Date("2026-10-04T19:00:00Z"), { fetch: pushService([200]), createClient: factory }),
    ).resolves.toEqual({ due: false });
    expect(factory).not.toHaveBeenCalled();
  });

  it(`keeps at most ${SEND_CONCURRENCY} sends in flight`, async () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i));
    const { factory } = client({ data: rows, error: null });
    let inFlight = 0;
    let peak = 0;
    const fetch = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return new Response(null, { status: 201 });
    });

    const summary = await runReminders(env, sunday, { fetch, createClient: factory });

    expect(summary).toMatchObject({ subscriptions: 20, sent: 20 });
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(peak).toBe(SEND_CONCURRENCY);
  });
});

describe("runReminders with an outside sender", () => {
  it("hands each push to the sender with its keys, payload and run time, and tallies the outcomes", async () => {
    const { rpc, factory } = client({ data: [0, 1, 2, 3].map((i) => row(i, [`Task ${i}`])), error: null });
    const outcomes = ["sent", "expired", "failed", "throw"] as const;
    const send = vi.fn((sub: { endpoint: string }) => {
      const outcome = outcomes[Number(/sub-(\d+)$/.exec(sub.endpoint)?.[1])];
      return outcome === "throw" ? Promise.reject(new Error(`died at ${sub.endpoint}`)) : Promise.resolve(outcome);
    });
    const fetch = pushService([]);

    const summary = await runReminders(env, sunday, { fetch, createClient: factory, send });

    expect(summary).toMatchObject({ outcome: "done", subscriptions: 4, sent: 1, pruned: 1, failed: 2 });
    expect(send).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/sub-0", p256dh, auth },
      reminderPayload(["Task 0"]),
      sunday.toISOString(),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("prune_push_subscriptions", {
      p_secret: SECRET,
      p_endpoints: ["https://push.example.com/sub-1"],
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ event: "reminders.send.failed", status: null }));
    expect(allLogText()).not.toContain("push.example.com");
  });
});

describe("sendReminder", () => {
  it("imports the keys and sends one encrypted push", async () => {
    const fetch = pushService([201]);

    const outcome = await sendReminder(env, row(0), reminderPayload(["Run"]), sunday, fetch);

    expect(outcome).toBe("sent");
    expect(fetch.mock.calls[0][0].headers.get("Content-Encoding")).toBe("aes128gcm");
  });

  it("counts a bad key pair as a failure without sending", async () => {
    const fetch = pushService([201]);

    const outcome = await sendReminder({ ...env, VAPID_PRIVATE_KEY: "bad" }, row(0), "{}", sunday, fetch);

    expect(outcome).toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
    expect(events(errorSpy)).toEqual(["reminders.config.invalid"]);
  });
});
