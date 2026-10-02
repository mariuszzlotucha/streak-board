import type { APIContext } from "astro";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";

// The middleware imports Astro's virtual module and the Supabase client reads `astro:env`; neither exists in Vitest.
vi.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const getUser = vi.fn();

type Handler = (context: APIContext, next: () => Promise<Response>) => Promise<Response>;

// `reportedNotConfigured` is module state, so every test gets a fresh module.
async function loadOnRequest() {
  vi.resetModules();
  const { createClient: freshCreateClient } = await import("@/lib/supabase");
  vi.mocked(freshCreateClient).mockImplementation(
    () => ({ auth: { getUser } }) as unknown as ReturnType<typeof createClient>,
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
    locals: { user: null } as { user: { id: string } | null },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as unknown as APIContext;
}

const next = () => Promise.resolve(new Response("page", { status: 200 }));

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

beforeEach(() => {
  getUser.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("middleware", () => {
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
