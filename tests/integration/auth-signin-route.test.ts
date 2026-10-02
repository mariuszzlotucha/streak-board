import type { APIContext } from "astro";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST } from "@/pages/api/auth/signin";

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const signInWithPassword = vi.fn();

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

function signIn() {
  const url = new URL("http://localhost:4321/api/auth/signin");
  const context = {
    request: new Request(url, {
      method: "POST",
      body: new URLSearchParams({ email: "person@example.com", password: "hunter2hunter2" }),
    }),
    routePattern: "/api/auth/signin",
    locals: { user: null },
    cookies: { set: vi.fn(), delete: vi.fn(), get: vi.fn() },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return POST(context) as Promise<Response>;
}

beforeEach(() => {
  signInWithPassword.mockReset();
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue({ auth: { signInWithPassword } } as unknown as ReturnType<
    typeof createClient
  >);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("POST /api/auth/signin reporting", () => {
  it("redirects with unknown and logs auth.signin.failed for a network failure", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });

    const response = await signIn();

    expect(response.headers.get("location")).toBe("/auth/signin?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "auth.signin.failed", status: 0, outcome: "unknown" });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("person@example.com");
  });

  it("stays silent for invalid credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });

    const response = await signIn();

    expect(response.headers.get("location")).toBe("/auth/signin?error=invalid_credentials");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logs an info line for a rate limit", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Too many requests", 429, "over_request_rate_limit"),
    });

    const response = await signIn();

    expect(response.headers.get("location")).toBe("/auth/signin?error=rate_limited");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.signin.failed",
      outcome: "rate_limited",
      status: 429,
    });
  });
});
