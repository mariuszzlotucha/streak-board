import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { GET } from "@/pages/auth/callback";

// The route is exercised without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const exchangeCodeForSession = vi.fn();

function callback(query: string) {
  const url = new URL(`http://localhost:4321/auth/callback${query}`);
  const context = {
    url,
    request: new Request(url),
    cookies: {},
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
    // The route logs failures server-side on purpose; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
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
});
