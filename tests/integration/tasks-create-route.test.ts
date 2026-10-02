import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST } from "@/pages/api/tasks/create";

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const insert = vi.fn();
const group = { id: "g1", name: "Team", owner_id: "user-1" };

let errorSpy: MockInstance<typeof console.error>;

// `getMyGroup` is `from("groups").select(...).maybeSingle()`; the insert goes to `from("tasks")`.
function fakeSupabase() {
  const groupsQuery = { select: () => ({ maybeSingle: () => Promise.resolve({ data: group, error: null }) }) };
  return {
    from: (table: string) => (table === "tasks" ? { insert } : groupsQuery),
  } as unknown as ReturnType<typeof createClient>;
}

function create() {
  const url = new URL("http://localhost:4321/api/tasks/create");
  const context = {
    request: new Request(url, { method: "POST", body: new URLSearchParams({ title: "Run", recurrence: "daily" }) }),
    routePattern: "/api/tasks/create",
    locals: { user: { id: "user-1" } },
    cookies: {},
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
  return POST(context) as Promise<Response>;
}

beforeEach(() => {
  insert.mockReset();
  vi.mocked(createClient).mockReset();
  vi.mocked(createClient).mockReturnValue(fakeSupabase());
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("POST /api/tasks/create reporting", () => {
  it("redirects with unknown and logs tasks.create.failed for an unmapped error", async () => {
    insert.mockResolvedValue({ error: { code: "XX000", message: "boom" }, status: 500 });

    const response = await create();

    expect(response.headers.get("location")).toBe("/dashboard?error=unknown");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "tasks.create.failed",
      userId: "user-1",
      status: 500,
      error: { code: "XX000" },
    });
  });

  it("stays silent for a validation failure (23514)", async () => {
    insert.mockResolvedValue({ error: { code: "23514", message: "check" }, status: 400 });

    const response = await create();

    expect(response.headers.get("location")).toBe("/dashboard?error=invalid_title");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
