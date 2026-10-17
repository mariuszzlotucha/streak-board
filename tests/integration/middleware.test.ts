import type { APIContext } from "astro";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";

// The middleware imports Astro's virtual module and the Supabase client reads `astro:env`; neither exists in Vitest.
vi.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
// The request wrapper needs `cloudflare:workers`; here it only runs the handler and records that it did.
const runWithSentry = vi.hoisted(() => vi.fn((_context: unknown, handler: () => Promise<Response>) => handler()));
vi.mock("@/lib/sentry", () => ({ runWithSentry }));

const getUser = vi.fn();
// The nickname read: `from("nicknames").select("nickname").eq("user_id", id).maybeSingle()` answers `nicknameResult`.
let nicknameResult: { data: { nickname: string } | null; error: unknown };
const maybeSingle = vi.fn(() => Promise.resolve(nicknameResult));
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

type Handler = (context: APIContext, next: () => Promise<Response>) => Promise<Response>;

// `reportedNotConfigured` is module state, so every test gets a fresh module.
async function loadOnRequest() {
  vi.resetModules();
  const { createClient: freshCreateClient } = await import("@/lib/supabase");
  vi.mocked(freshCreateClient).mockImplementation(
    () => ({ auth: { getUser }, from }) as unknown as ReturnType<typeof createClient>,
  );
  const { onRequest } = await import("@/middleware");
  return { onRequest: onRequest as unknown as Handler, createClient: vi.mocked(freshCreateClient) };
}

function buildContext(path: string, headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost:4321${path}`);
  return {
    url,
    request: new Request(url, { headers }),
    cookies: {},
    routePattern: path,
    locals: { user: null, nickname: null } as { user: { id: string } | null; nickname: string | null },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as unknown as APIContext;
}

const next = () => Promise.resolve(new Response("page", { status: 200 }));

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

beforeEach(() => {
  getUser.mockReset();
  // A signed-in user on a protected path has a nickname unless a test says otherwise.
  nicknameResult = { data: { nickname: "Kasia" }, error: null };
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  maybeSingle.mockClear();
  runWithSentry.mockClear();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("middleware", () => {
  it("runs the whole request through runWithSentry", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const context = buildContext("/dashboard");

    const response = await onRequest(context, next);

    expect(runWithSentry).toHaveBeenCalledOnce();
    expect(runWithSentry.mock.calls[0][0]).toBe(context);
    expect(response.status).toBe(200);
  });

  it("answers 503 JSON and logs auth.unavailable when Auth is down on a protected API path", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });

    const response = await onRequest(
      buildContext("/api/tasks/checkoff", { Accept: "application/json", "cf-ray": "r1" }),
      next,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "auth.unavailable",
      route: "/api/tasks/checkoff",
      ray: "r1",
    });
  });

  it("answers 503 HTML on /dashboard when Auth is down", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });

    const response = await onRequest(buildContext("/dashboard"), next);

    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("redirects a visitor without a session to sign-in and writes nothing", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });

    const response = await onRequest(buildContext("/dashboard"), next);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("redirects and logs auth.unexpected for an unexpected Auth error", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("nope", 401, undefined) });

    const response = await onRequest(buildContext("/dashboard"), next);

    expect(response.status).toBe(302);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "auth.unexpected" });
  });

  it("redirects on missing configuration and reports it once across two requests", async () => {
    const { onRequest, createClient: mockedCreateClient } = await loadOnRequest();
    mockedCreateClient.mockReturnValue(null);

    const first = await onRequest(buildContext("/dashboard"), next);
    const second = await onRequest(buildContext("/dashboard"), next);

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "auth.not_configured" });
  });

  it("renders a public page without a user when Auth is down", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    const context = buildContext("/auth/signin");
    const pass = vi.fn(next);

    const response = await onRequest(context, pass);

    expect(response.status).toBe(200);
    expect(pass).toHaveBeenCalledOnce();
    expect(context.locals.user).toBeNull();
  });

  it("passes a signed-in user through to the page", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const context = buildContext("/dashboard");

    const response = await onRequest(context, next);

    expect(response.status).toBe(200);
    expect(context.locals.user).toEqual({ id: "u1" });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("middleware nickname gate", () => {
  it("reads the user's own row once and puts the nickname into locals", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const context = buildContext("/dashboard");

    const response = await onRequest(context, next);

    expect(response.status).toBe(200);
    expect(context.locals.nickname).toBe("Kasia");
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("nicknames");
    expect(select).toHaveBeenCalledWith("nickname");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it.each(["/dashboard", "/settings", "/api/tasks/checkoff", "/api/groups/join"])(
    "redirects a signed-in user without a nickname from %s to the nickname page",
    async (path) => {
      const { onRequest } = await loadOnRequest();
      getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      nicknameResult = { data: null, error: null };
      const pass = vi.fn(next);

      const response = await onRequest(buildContext(path), pass);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/account/nickname");
      expect(pass).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it.each(["/account/nickname", "/api/account/nickname"])(
    "lets a signed-in user without a nickname reach %s, with locals.nickname null",
    async (path) => {
      const { onRequest } = await loadOnRequest();
      getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      nicknameResult = { data: null, error: null };
      const context = buildContext(path);
      // A stale value, so the null below is the middleware's write, not the fixture's.
      context.locals.nickname = "stale";
      const pass = vi.fn(next);

      const response = await onRequest(context, pass);

      expect(response.status).toBe(200);
      expect(pass).toHaveBeenCalledOnce();
      expect(context.locals.nickname).toBeNull();
      expect(maybeSingle).toHaveBeenCalledOnce();
    },
  );

  it("reads the nickname on the nickname page too, so the route knows a first choice from a change", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const context = buildContext("/api/account/nickname");

    const response = await onRequest(context, next);

    expect(response.status).toBe(200);
    expect(context.locals.nickname).toBe("Kasia");
  });

  it("answers 503 and logs nickname.lookup.failed once when the read fails", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    nicknameResult = { data: null, error: { code: "", message: "TypeError: fetch failed" } };
    const pass = vi.fn(next);

    const response = await onRequest(buildContext("/dashboard", { "cf-ray": "r1" }), pass);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(pass).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "nickname.lookup.failed",
      route: "/dashboard",
      userId: "u1",
      ray: "r1",
    });
  });

  it("answers 503 JSON on an API path when the read fails", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    nicknameResult = { data: null, error: { code: "XX000", message: "boom" } };

    const response = await onRequest(buildContext("/api/account/nickname", { Accept: "application/json" }), next);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "nickname.lookup.failed", userId: "u1" });
  });

  it.each(["/api/reminders/subscribe", "/api/reminders/unsubscribe", "/api/reminders/unsubscribe-all"])(
    "redirects a visitor without a session away from %s",
    async (path) => {
      const { onRequest } = await loadOnRequest();
      getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
      const pass = vi.fn(next);

      const response = await onRequest(buildContext(path), pass);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/auth/signin");
      expect(pass).not.toHaveBeenCalled();
    },
  );

  it("sends an anonymous visitor to sign-in without reading a nickname", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });

    const response = await onRequest(buildContext("/account/nickname"), next);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(from).not.toHaveBeenCalled();
  });

  it("does not read a nickname on a public page", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    nicknameResult = { data: null, error: null };
    const context = buildContext("/privacy");
    // A stale value, so the null below proves the middleware resets it.
    context.locals.nickname = "stale";

    const response = await onRequest(context, next);

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(context.locals.nickname).toBeNull();
  });

  it("does not treat a path that only starts with the same letters as protected", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const response = await onRequest(buildContext("/accounts"), next);

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
  });

  it("reports an exception from next() as request.unhandled and rethrows the same error", async () => {
    const { onRequest } = await loadOnRequest();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const failure = new Error("render failed");

    await expect(onRequest(buildContext("/dashboard"), () => Promise.reject(failure))).rejects.toBe(failure);

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "request.unhandled",
      userId: "u1",
      error: { message: "render failed" },
    });
  });
});
