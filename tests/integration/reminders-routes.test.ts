import { randomUUID } from "node:crypto";
import type { APIContext, APIRoute } from "astro";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST as subscribe } from "@/pages/api/reminders/subscribe";
import { POST as unsubscribe } from "@/pages/api/reminders/unsubscribe";
import { POST as unsubscribeAll } from "@/pages/api/reminders/unsubscribe-all";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../helpers/supabase";

// The routes run without Astro's runtime (no `astro:env`), so `createClient` is stubbed to hand them the signed-in test
// user's real client: the calls reach subscribe_push / unsubscribe_push / unsubscribe_all_push in the local database.
// The middleware's redirect of anonymous callers on /api/reminders is in tests/integration/middleware.test.ts; here the
// route's own 401 fallback.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const ORIGIN = "http://localhost:4321";
const KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XLjhUZ4Tq8RhBiwVnSbu0QE",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

let user: TestUser;
let errorSpy: MockInstance<typeof console.error>;

function call(route: APIRoute, path: string, body?: unknown, { signedIn = true, headers = {} } = {}) {
  const url = new URL(path, ORIGIN);
  const init: RequestInit = { method: "POST", headers: { origin: ORIGIN, ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json", ...(init.headers as Record<string, string>) };
  }
  const context = {
    request: new Request(url, init),
    url,
    routePattern: path,
    locals: { user: signedIn ? { id: user.id } : null },
    cookies: {},
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as unknown as APIContext;
  return route(context) as Promise<Response>;
}

async function endpointsOf(userId: string): Promise<string[]> {
  const { data, error } = await adminClient().from("push_subscriptions").select("endpoint").eq("user_id", userId);
  if (error) throw new Error(`endpointsOf failed: ${error.message}`);
  return data.map((row) => row.endpoint).sort();
}

const endpoint = () => `https://push.example/${randomUUID()}`;

beforeAll(async () => {
  user = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(user);
});

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue(user.client);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("POST /api/reminders/*", () => {
  it("subscribe stores the device, unsubscribe removes it, unsubscribe-all removes every device", async () => {
    const [first, second] = [endpoint(), endpoint()];
    expect((await call(subscribe, "/api/reminders/subscribe", { endpoint: first, keys: KEYS })).status).toBe(204);
    expect((await call(subscribe, "/api/reminders/subscribe", { endpoint: second, keys: KEYS })).status).toBe(204);
    expect(await endpointsOf(user.id)).toEqual([first, second].sort());

    expect((await call(unsubscribe, "/api/reminders/unsubscribe", { endpoint: first })).status).toBe(204);
    expect(await endpointsOf(user.id)).toEqual([second]);

    expect((await call(unsubscribeAll, "/api/reminders/unsubscribe-all")).status).toBe(204);
    expect(await endpointsOf(user.id)).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("answers 401 without a user and touches nothing", async () => {
    const url = endpoint();
    expect(
      (await call(subscribe, "/api/reminders/subscribe", { endpoint: url, keys: KEYS }, { signedIn: false })).status,
    ).toBe(401);
    expect((await call(unsubscribeAll, "/api/reminders/unsubscribe-all", undefined, { signedIn: false })).status).toBe(
      401,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["no keys", { endpoint: "https://push.example/x" }],
    ["http endpoint", { endpoint: "http://push.example/x", keys: KEYS }],
    ["not a URL", { endpoint: "push", keys: KEYS }],
    ["oversized endpoint", { endpoint: `https://push.example/${"a".repeat(2100)}`, keys: KEYS }],
    ["non-base64url key", { endpoint: "https://push.example/x", keys: { ...KEYS, auth: "a b" } }],
    ["malformed JSON", "{"],
  ])("subscribe answers 400 for %s", async (_name, body) => {
    expect((await call(subscribe, "/api/reminders/subscribe", body)).status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("unsubscribe answers 400 without an endpoint", async () => {
    expect((await call(unsubscribe, "/api/reminders/unsubscribe", {})).status).toBe(400);
  });

  it("refuses a non-JSON body (415) and a foreign origin (403)", async () => {
    const body = { endpoint: endpoint(), keys: KEYS };
    expect(
      (
        await call(subscribe, "/api/reminders/subscribe", JSON.stringify(body), {
          headers: { "content-type": "text/plain" },
        })
      ).status,
    ).toBe(415);
    expect(
      (await call(subscribe, "/api/reminders/subscribe", body, { headers: { origin: "https://evil.example" } })).status,
    ).toBe(403);
    expect(await endpointsOf(user.id)).toEqual([]);
  });

  it("reports a returned Supabase error as reminders.<action>.failed and answers 500", async () => {
    const rpc = vi.fn(() => Promise.resolve({ error: { code: "XX000", message: "boom" }, status: 500 }));
    vi.mocked(createClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createClient>);

    expect((await call(unsubscribeAll, "/api/reminders/unsubscribe-all")).status).toBe(500);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "reminders.unsubscribe_all.failed",
      userId: user.id,
      status: 500,
      error: { code: "XX000" },
    });
  });

  it("answers 503 when Supabase is not configured", async () => {
    vi.mocked(createClient).mockReturnValue(null);
    expect((await call(unsubscribe, "/api/reminders/unsubscribe", { endpoint: endpoint() })).status).toBe(503);
  });
});
