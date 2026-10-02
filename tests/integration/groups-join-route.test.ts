import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST } from "@/pages/api/groups/join";

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const rpc = vi.fn();
const CODE = "a1b2c3d4e5f6";

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

function join(body: BodyInit | null, headers: Record<string, string> = {}) {
  const url = new URL("http://localhost:4321/api/groups/join");
  const context = {
    request: new Request(url, { method: "POST", body, headers: { "cf-ray": "ray-1", ...headers } }),
    routePattern: "/api/groups/join",
    locals: { user: { id: "user-1" } },
    cookies: { delete: vi.fn(), set: vi.fn(), get: vi.fn() },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return POST(context) as Promise<Response>;
}

const codeForm = () => new URLSearchParams({ code: CODE });

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createClient>);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("POST /api/groups/join reporting", () => {
  it("redirects with unknown and logs groups.join.failed for a 500, without the invite code", async () => {
    rpc.mockResolvedValue({
      error: {
        code: "XX000",
        message: "duplicate key value violates unique constraint",
        details: `Key (join_code)=(${CODE}) already exists.`,
      },
      status: 500,
    });

    const response = await join(codeForm());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "groups.join.failed",
      userId: "user-1",
      ray: "ray-1",
      status: 500,
      codeLength: CODE.length,
      error: { code: "XX000" },
    });
    // The code is a bearer secret: it never appears in a logged value (the details carry it in a Key fragment).
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(CODE);
  });

  it("stays silent for an invalid code (P0002)", async () => {
    rpc.mockResolvedValue({ error: { code: "P0002", message: "invalid" }, status: 400 });

    const response = await join(codeForm());

    expect(response.headers.get("location")).toBe("/dashboard?error=invalid_code");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logs an error for 42501 and keeps the forbidden redirect", async () => {
    rpc.mockResolvedValue({ error: { code: "42501", message: "denied" }, status: 403 });

    const response = await join(codeForm());

    expect(response.headers.get("location")).toBe("/dashboard?error=forbidden");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "groups.join.failed", outcome: "forbidden", status: 403 });
  });

  it("logs groups.join.exception when the body is not a form", async () => {
    const response = await join("not a form", { "Content-Type": "application/json" });

    expect(response.headers.get("location")).toBe("/dashboard?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "groups.join.exception", userId: "user-1" });
  });
});
