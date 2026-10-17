import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST } from "@/pages/api/auth/signup";

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

// Oracle: invite-auto-join (owner's decision 2026-10-18). The e-mail confirmation link works only in the browser that
// signed up, so the pending invite goes with the new account (user_metadata.join_code) and survives a sign-in elsewhere.

const signUp = vi.fn();
const CODE = "a1b2c3d4e5f6";

function submit(joinCookie?: string) {
  const url = new URL("http://localhost:4321/api/auth/signup");
  const context = {
    request: new Request(url, {
      method: "POST",
      body: new URLSearchParams({ email: "person@example.com", password: "hunter2hunter2" }),
    }),
    url,
    routePattern: "/api/auth/signup",
    locals: { user: null },
    cookies: {
      set: vi.fn(),
      delete: vi.fn(),
      get: vi.fn((name: string) =>
        name === "join_code" && joinCookie !== undefined ? { value: joinCookie } : undefined,
      ),
    },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return POST(context) as Promise<Response>;
}

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue({ auth: { signUp } } as unknown as ReturnType<typeof createClient>);
});

describe("POST /api/auth/signup with a pending invite", () => {
  it("stores the pending invite with the new account", async () => {
    const response = await submit(CODE);

    expect(response.headers.get("location")).toBe("/auth/confirm-email");
    expect(signUp).toHaveBeenCalledExactlyOnceWith({
      email: "person@example.com",
      password: "hunter2hunter2",
      options: { emailRedirectTo: "http://localhost:4321/auth/callback", data: { join_code: CODE } },
    });
  });

  it("stores nothing without an invite, or with a forged cookie value", async () => {
    for (const cookie of [undefined, "not a code!"]) {
      signUp.mockClear();
      await submit(cookie);
      expect(signUp).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          options: { emailRedirectTo: "http://localhost:4321/auth/callback", data: undefined },
        }),
      );
    }
  });
});
