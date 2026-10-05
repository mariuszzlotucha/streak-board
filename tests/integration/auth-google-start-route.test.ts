import type { APIContext } from "astro";
import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST } from "@/pages/api/auth/google";

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const signInWithOAuth = vi.fn();
const cookies = { set: vi.fn(), delete: vi.fn(), get: vi.fn(), has: vi.fn() };

// What Supabase builds: it carries the PKCE challenge, so it must never reach a report.
const AUTHORIZE_URL = "https://project.supabase.co/auth/v1/authorize?provider=google&code_challenge=challenge-123";

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

function start() {
  const url = new URL("http://localhost:4321/api/auth/google");
  const context = {
    request: new Request(url, { method: "POST" }),
    routePattern: "/api/auth/google",
    locals: { user: null },
    cookies,
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return POST(context) as Promise<Response>;
}

function expectNoUrlInLogs() {
  const logged = JSON.stringify([...errorSpy.mock.calls, ...infoSpy.mock.calls]);
  expect(logged).not.toContain("code_challenge");
  expect(logged).not.toContain("supabase.co");
  expect(logged).not.toContain("localhost:4321");
}

beforeEach(() => {
  signInWithOAuth.mockReset();
  Object.values(cookies).forEach((spy) => spy.mockReset());
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue({ auth: { signInWithOAuth } } as unknown as ReturnType<typeof createClient>);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("POST /api/auth/google", () => {
  it("redirects to the URL Supabase built, asking for the return route on the request origin", async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: AUTHORIZE_URL }, error: null });

    const response = await start();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(AUTHORIZE_URL);
    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: "google",
      options: { redirectTo: "http://localhost:4321/auth/google/callback" },
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("sets and clears no cookie of its own", async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: AUTHORIZE_URL }, error: null });

    await start();

    expect(cookies.set).not.toHaveBeenCalled();
    expect(cookies.delete).not.toHaveBeenCalled();
  });

  it("redirects with unknown and logs auth.google.start_failed for a returned error", async () => {
    // The URL is deliberately present next to the error: a report that carried the response data would leak it.
    signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: AUTHORIZE_URL },
      error: new AuthApiError("Unsupported provider", 400, "validation_failed"),
    });

    const response = await start();

    expect(response.headers.get("location")).toBe("/auth/signin?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.start_failed",
      route: "/api/auth/google",
      status: 400,
      error: { code: "validation_failed" },
    });
    expectNoUrlInLogs();
  });

  it("redirects with unknown and logs auth.google.start_failed when Supabase returns no URL", async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: "google", url: null }, error: null });

    const response = await start();

    expect(response.headers.get("location")).toBe("/auth/signin?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "auth.google.start_failed", route: "/api/auth/google" });
    expectNoUrlInLogs();
  });

  it("redirects with unknown and logs auth.google.start_exception when the call throws", async () => {
    signInWithOAuth.mockRejectedValue(new Error("network down"));

    const response = await start();

    expect(response.headers.get("location")).toBe("/auth/signin?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.start_exception",
      route: "/api/auth/google",
      error: { message: "network down" },
    });
    expectNoUrlInLogs();
  });

  it("redirects with not_configured, quietly, when Supabase is not configured", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    const response = await start();

    expect(response.headers.get("location")).toBe("/auth/signin?error=not_configured");
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
