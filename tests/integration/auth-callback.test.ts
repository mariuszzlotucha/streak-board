import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { GET } from "@/pages/auth/callback";

// The route is exercised without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const exchangeCodeForSession = vi.fn();

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

function callback(query: string) {
  const url = new URL(`http://localhost:4321/auth/callback${query}`);
  const context = {
    url,
    request: new Request(url),
    cookies: {},
    routePattern: "/auth/callback",
    locals: { user: null },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return GET(context) as Promise<Response>;
}

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(location);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockReturnValue({ auth: { exchangeCodeForSession } } as unknown as ReturnType<
      typeof createClient
    >);
    // The route reports failures through the log helpers on purpose; keep the test output clean.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("redirects to the dashboard after a successful code exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    expectRedirect(await callback("?code=abc"), "/dashboard");
    expect(exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("abc");
  });

  it("redirects to sign-in with link_expired when the code is missing", async () => {
    expectRedirect(await callback(""), "/auth/signin?error=link_expired");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to sign-in with link_expired even when a code accompanies an error_code", async () => {
    expectRedirect(await callback("?code=abc&error_code=otp_expired"), "/auth/signin?error=link_expired");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("does not exchange a code that arrives together with an error param", async () => {
    expectRedirect(await callback("?code=abc&error=access_denied"), "/auth/signin?error=link_expired");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to sign-in with link_expired when the exchange returns an error", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: { code: "flow_state_not_found" } });

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=link_expired");
  });

  it("redirects to sign-in with link_expired when the exchange throws", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network down"));

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=link_expired");
  });

  it("redirects to sign-in with not_configured when Supabase is not configured", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=not_configured");
  });

  it("stays silent when the link is unusable before any exchange", async () => {
    await callback("");
    await callback("?code=abc&error=access_denied");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logs an info line, not an error, when the exchange fails with a stale code", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: { code: "flow_state_not_found", status: 404 } });

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=link_expired");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      level: "info",
      event: "auth.callback.stale",
      route: "/auth/callback",
      code: "flow_state_not_found",
      status: 404,
    });
  });

  it("logs an error line when the exchange fails with an unexpected error", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: { code: "unexpected_failure", status: 500, message: "Database error" },
    });

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=link_expired");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "auth.callback.failed",
      route: "/auth/callback",
      status: 500,
      error: { code: "unexpected_failure" },
    });
  });

  it("logs an error line when the exchange throws", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network down"));

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=link_expired");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "auth.callback.exception",
      route: "/auth/callback",
      error: { message: "network down" },
    });
  });
});
