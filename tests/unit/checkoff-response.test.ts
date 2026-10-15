import type { APIContext } from "astro";
import { describe, expect, it, vi } from "vitest";
import { checkoffResponse, type CheckoffResult } from "@/lib/checkoff-response";

// Oracle: the FAILURES table in src/lib/checkoff-response.ts. A plain form POST gets a redirect that reuses the
// dashboard's error codes (a gone task ends quietly on the dashboard); a fetch asking for JSON gets the status, the
// result kind as `error` and `Cache-Control: no-store`.

function contextWith(headers: Record<string, string>) {
  const redirect = vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } }));
  const context = {
    request: new Request("http://localhost:4321/api/tasks/checkoff", { method: "POST", headers }),
    redirect,
  } as unknown as APIContext;
  return { context, redirect };
}

const FAILURES: { kind: Exclude<CheckoffResult["kind"], "ok">; status: number; redirect: string }[] = [
  { kind: "invalid", status: 400, redirect: "/dashboard?error=forbidden" },
  { kind: "not_configured", status: 503, redirect: "/dashboard?error=not_configured" },
  { kind: "gone", status: 404, redirect: "/dashboard" },
  { kind: "forbidden", status: 403, redirect: "/dashboard?error=forbidden" },
  { kind: "unknown", status: 500, redirect: "/dashboard?error=unknown" },
];

function resultOf(kind: CheckoffResult["kind"]): CheckoffResult {
  if (kind === "ok") return { kind, period: "2026-10-08" };
  if (kind === "unknown") return { kind, error: new Error("boom") };
  return { kind };
}

async function jsonOf(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

describe("checkoffResponse for a form POST", () => {
  it.each(FAILURES)("redirects $kind to $redirect", ({ kind, redirect }) => {
    const { context, redirect: redirectSpy } = contextWith({});

    const response = checkoffResponse(context, resultOf(kind));

    expect(redirectSpy).toHaveBeenCalledExactlyOnceWith(redirect);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(redirect);
  });

  it("redirects ok to the dashboard", () => {
    const { context, redirect } = contextWith({ Accept: "text/html" });

    const response = checkoffResponse(context, { kind: "ok", period: "2026-10-08" });

    expect(redirect).toHaveBeenCalledExactlyOnceWith("/dashboard");
    expect(response.status).toBe(302);
  });
});

describe("checkoffResponse for a JSON fetch", () => {
  it.each(FAILURES)("answers $kind with $status and the kind as the error code", async ({ kind, status }) => {
    const { context, redirect } = contextWith({ Accept: "application/json" });

    const response = checkoffResponse(context, resultOf(kind));

    expect(redirect).not.toHaveBeenCalled();
    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({ ok: false, error: kind });
  });

  it("answers ok with 200 and the period", async () => {
    const { context, redirect } = contextWith({ Accept: "application/json" });

    const response = checkoffResponse(context, { kind: "ok", period: "2026-10-05" });

    expect(redirect).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({ ok: true, period: "2026-10-05" });
  });

  it("never puts the unknown error's message in the body", async () => {
    const { context } = contextWith({ Accept: "application/json" });

    const response = checkoffResponse(context, { kind: "unknown", error: new Error("secret@example.test") });

    expect(await response.text()).not.toContain("secret");
  });

  it("matches Accept case-insensitively and as a substring", async () => {
    for (const accept of [
      "APPLICATION/JSON",
      "Application/Json",
      "text/html, application/json;q=0.9",
      "*/*, application/json",
    ]) {
      const { context, redirect } = contextWith({ Accept: accept });

      const response = checkoffResponse(context, { kind: "gone" });

      expect(redirect, accept).not.toHaveBeenCalled();
      expect(response.status, accept).toBe(404);
      expect(await jsonOf(response)).toEqual({ ok: false, error: "gone" });
    }
  });

  it("falls back to a redirect for other Accept values", () => {
    for (const accept of ["*/*", "text/html", "application/xml", "application/jso"]) {
      const { context, redirect } = contextWith({ Accept: accept });

      const response = checkoffResponse(context, { kind: "gone" });

      expect(redirect, accept).toHaveBeenCalledExactlyOnceWith("/dashboard");
      expect(response.status, accept).toBe(302);
    }
  });
});
