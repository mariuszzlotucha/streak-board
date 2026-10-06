import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { POST as start } from "@/pages/api/auth/google";
import { GET as callback } from "@/pages/auth/google/callback";

// Both routes run for real, with the real Supabase client and the real cookie adapter of `src/lib/supabase.ts`, against
// the local stack. Only `astro:env` (no Astro runtime in Vitest) is supplied, from the stack's own URL and anon key.
vi.mock("astro:env/server", async () => {
  const { inject } = await import("vitest");
  return { SUPABASE_URL: inject("supabaseUrl"), SUPABASE_KEY: inject("supabaseAnonKey") };
});

// Well formed and unknown to GoTrue: the exchange reaches the stack's own answer.
const UNKNOWN_FLOW_CODE = "11111111-1111-4111-8111-111111111111";

let infoSpy: MockInstance<typeof console.info>;
let errorSpy: MockInstance<typeof console.error>;

function cookieJar() {
  const jar = new Map<string, string>();
  const cookies = {
    set: vi.fn((name: string, value: string) => {
      jar.set(name, value);
    }),
    delete: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
  } as unknown as APIContext["cookies"];
  return { jar, cookies };
}

function redirect(path: string) {
  return new Response(null, { status: 302, headers: { Location: path } });
}

async function startGoogleSignIn() {
  const { jar, cookies } = cookieJar();
  const url = new URL("http://localhost:4321/api/auth/google");
  const context = {
    request: new Request(url, { method: "POST" }),
    routePattern: "/api/auth/google",
    locals: { user: null },
    cookies,
    redirect,
  } as unknown as APIContext;
  const response = await start(context);
  return { response, jar };
}

function returnFromGoogle(code: string, jar: Map<string, string>) {
  // What the browser sends back: every cookie the start route set.
  const cookie = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  const url = new URL(`http://localhost:4321/auth/google/callback?code=${code}`);
  const context = {
    url,
    request: new Request(url, { headers: cookie ? { cookie } : {} }),
    routePattern: "/auth/google/callback",
    locals: { user: null },
    cookies: cookieJar().cookies,
    redirect,
  } as unknown as APIContext;
  return callback(context) as Promise<Response>;
}

beforeEach(() => {
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Google sign-in round trip (real SDK, real cookie adapter, local stack)", () => {
  it("lets the return route find the code verifier the start route wrote", async () => {
    const started = await startGoogleSignIn();
    expect(started.response.status).toBe(302);
    expect(started.response.headers.get("location")).toContain("/auth/v1/authorize?provider=google");
    expect([...started.jar.keys()].some((name) => name.includes("code-verifier"))).toBe(true);

    const returned = await returnFromGoogle(UNKNOWN_FLOW_CODE, started.jar);

    // The verifier was found, so the exchange went to GoTrue, which does not know the code. Had the lookup failed, the
    // SDK would have refused first with `pkce_code_verifier_not_found`; both end on oauth_failed, only the code differs.
    expect(returned.headers.get("location")).toBe("/auth/signin?error=oauth_failed");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.callback.failed",
      outcome: "oauth_failed",
      code: "flow_state_not_found",
    });
  });

  it("is refused by the SDK itself when the verifier cookies do not come back", async () => {
    // The control for the test above: it shows that the two outcomes really are told apart by the logged code.
    const returned = await returnFromGoogle(UNKNOWN_FLOW_CODE, new Map());

    expect(returned.headers.get("location")).toBe("/auth/signin?error=oauth_failed");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.callback.failed",
      outcome: "oauth_failed",
      code: "pkce_code_verifier_not_found",
    });
  });
});
