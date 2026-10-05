import type { APIContext } from "astro";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { GET } from "@/pages/auth/google/callback";

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const exchangeCodeForSession = vi.fn();
const cookies = { set: vi.fn(), delete: vi.fn(), get: vi.fn(), has: vi.fn() };

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

function callback(query: string) {
  const url = new URL(`http://localhost:4321/auth/google/callback${query}`);
  const context = {
    url,
    request: new Request(url, { headers: { cookie: "sb-test-code-verifier=abc" } }),
    routePattern: "/auth/google/callback",
    locals: { user: null },
    cookies,
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return GET(context) as Promise<Response>;
}

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(location);
}

function expectCookiesUntouched() {
  expect(cookies.set).not.toHaveBeenCalled();
  expect(cookies.delete).not.toHaveBeenCalled();
  expect(cookies.get).not.toHaveBeenCalled();
  expect(cookies.has).not.toHaveBeenCalled();
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  Object.values(cookies).forEach((spy) => spy.mockReset());
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue({ auth: { exchangeCodeForSession } } as unknown as ReturnType<
    typeof createClient
  >);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("GET /auth/google/callback without an exchange", () => {
  it("redirects with oauth_failed and an info line when nothing comes back", async () => {
    expectRedirect(await callback(""), "/auth/signin?error=oauth_failed");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    const line = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(line).toMatchObject({
      level: "info",
      event: "auth.google.callback.returned",
      route: "/auth/google/callback",
      outcome: "oauth_failed",
    });
    expect(line.providerError).toBeUndefined();
    expect(line.providerErrorCode).toBeUndefined();
    expectCookiesUntouched();
  });

  it("redirects with oauth_cancelled when the user denies consent, without logging the provider text", async () => {
    expectRedirect(
      await callback("?error=access_denied&error_description=The%20user%20denied%20access"),
      "/auth/signin?error=oauth_cancelled",
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    const line = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(line).toMatchObject({
      event: "auth.google.callback.returned",
      outcome: "oauth_cancelled",
      providerError: "access_denied",
    });
    expect(line.providerErrorCode).toBeUndefined();
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("denied access");
    expectCookiesUntouched();
  });

  it("redirects with unknown, as an info line, when Supabase refuses with an error_code", async () => {
    expectRedirect(
      await callback("?error=access_denied&error_code=signup_disabled&error_description=Signups%20not%20allowed"),
      "/auth/signin?error=unknown",
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.callback.returned",
      outcome: "unknown",
      providerError: "access_denied",
      providerErrorCode: "signup_disabled",
    });
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("Signups");
    expectCookiesUntouched();
  });

  it("redirects with unknown, as an info line, for a server_error return", async () => {
    expectRedirect(await callback("?error=server_error"), "/auth/signin?error=unknown");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.callback.returned",
      outcome: "unknown",
      providerError: "server_error",
    });
  });

  it("does not exchange a code that arrives together with an error", async () => {
    expectRedirect(await callback("?code=abc&error=server_error"), "/auth/signin?error=unknown");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("keeps a provider value that is not a short token out of the report", async () => {
    const long = "a".repeat(41);
    expectRedirect(
      await callback(`?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E&error_code=${long}`),
      "/auth/signin?error=unknown",
    );

    expect(infoSpy).toHaveBeenCalledOnce();
    const line = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(line).toMatchObject({ event: "auth.google.callback.returned", outcome: "unknown" });
    expect(line.providerError).toBeUndefined();
    expect(line.providerErrorCode).toBeUndefined();
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("script");
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain(long);
  });

  it("redirects with not_configured, quietly, when Supabase is not configured", async () => {
    vi.mocked(createClient).mockReturnValue(null);

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=not_configured");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

describe("GET /auth/google/callback exchange", () => {
  it("redirects to the dashboard after a successful exchange, quietly", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    expectRedirect(await callback("?code=abc"), "/dashboard");

    expect(exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("abc");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expectCookiesUntouched();
  });

  it("builds the Supabase client from the request's own headers and the Astro cookies", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    await callback("?code=abc");

    expect(createClient).toHaveBeenCalledOnce();
    const [headers, passedCookies] = vi.mocked(createClient).mock.calls[0];
    expect(headers.get("cookie")).toBe("sb-test-code-verifier=abc");
    expect(passedCookies).toBe(cookies);
  });

  it.each([
    ["flow_state_not_found", 404],
    ["flow_state_expired", 422],
    ["bad_code_verifier", 400],
    ["pkce_code_verifier_not_found", 400],
  ])("redirects with oauth_failed and logs an info line for the stale code %s", async (code, status) => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: new AuthApiError("stale", status, code) });

    expectRedirect(await callback("?code=secret-code-123"), "/auth/signin?error=oauth_failed");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      level: "info",
      event: "auth.google.callback.failed",
      route: "/auth/google/callback",
      outcome: "oauth_failed",
      code,
      status,
    });
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain("secret-code-123");
    expectCookiesUntouched();
  });

  it("redirects with rate_limited and logs an info line for a rate limit", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: new AuthApiError("Too many requests", 429, "over_request_rate_limit"),
    });

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=rate_limited");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.google.callback.failed",
      outcome: "rate_limited",
      code: "over_request_rate_limit",
      status: 429,
    });
  });

  it("redirects with unknown and logs an error line for an unexpected returned error", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: new AuthApiError("Database error", 500, "unexpected_failure"),
    });

    expectRedirect(await callback("?code=secret-code-123"), "/auth/signin?error=unknown");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "auth.google.callback.failed",
      route: "/auth/google/callback",
      outcome: "unknown",
      status: 500,
      error: { code: "unexpected_failure" },
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-code-123");
  });

  it("redirects with unknown and logs an error line for a network failure", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: new AuthRetryableFetchError("fetch failed", 0) });

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=unknown");

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "auth.google.callback.failed", status: 0 });
  });

  it("redirects with unknown and logs auth.google.callback.exception when the exchange throws", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network down"));

    expectRedirect(await callback("?code=abc"), "/auth/signin?error=unknown");

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "auth.google.callback.exception",
      route: "/auth/google/callback",
      error: { message: "network down" },
    });
    expectCookiesUntouched();
  });
});
