import type { APIContext } from "astro";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportInfo } from "@/lib/log";
import { POST } from "@/pages/api/csp-report";

vi.mock("@/lib/log", () => ({ reportInfo: vi.fn() }));

function call(body: string, contentType = "application/csp-report", extra: Record<string, string> = {}) {
  const headers = new Headers({ "Content-Type": contentType, ...extra });
  const request = new Request("http://localhost/api/csp-report", { method: "POST", headers, body });
  return POST({ request, routePattern: "/api/csp-report", locals: { user: null } } as unknown as APIContext);
}

afterEach(() => {
  vi.mocked(reportInfo).mockReset();
});

describe("POST /api/csp-report", () => {
  it("logs a legacy report with the blocked origin only and the document path only", async () => {
    const response = await call(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://streakboard.app/dashboard?error=x#top",
          "effective-directive": "script-src-elem",
          "violated-directive": "script-src",
          "blocked-uri": "https://x.test/a?email=a@b.c",
          "script-sample": "secret()",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(reportInfo).toHaveBeenCalledExactlyOnceWith("csp.violation", {
      directive: "script-src-elem",
      blocked: "https://x.test",
      path: "/dashboard",
    });
  });

  it("falls back to violated-directive and keeps the inline keyword", async () => {
    await call(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://streakboard.app/",
          "violated-directive": "style-src",
          "blocked-uri": "inline",
        },
      }),
      "application/csp-report; charset=utf-8",
    );

    expect(reportInfo).toHaveBeenCalledExactlyOnceWith("csp.violation", {
      directive: "style-src",
      blocked: "inline",
      path: "/",
    });
  });

  it("logs each csp-violation of a Reporting API batch and skips other report types", async () => {
    const response = await call(
      JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://streakboard.app/settings?x=1",
            effectiveDirective: "img-src",
            blockedURL: "data:image/png;base64,AAAA",
            sample: "nope",
          },
        },
        { type: "deprecation", body: { message: "x" } },
        {
          type: "csp-violation",
          body: { documentURL: "https://streakboard.app/", effectiveDirective: "script-src-elem", blockedURL: "eval" },
        },
      ]),
      "application/reports+json",
    );

    expect(response.status).toBe(204);
    expect(vi.mocked(reportInfo).mock.calls).toEqual([
      ["csp.violation", { directive: "img-src", blocked: "data", path: "/settings" }],
      ["csp.violation", { directive: "script-src-elem", blocked: "eval", path: "/" }],
    ]);
  });

  it("truncates a long directive", async () => {
    await call(JSON.stringify({ "csp-report": { "effective-directive": "x".repeat(1000) } }));

    expect(vi.mocked(reportInfo).mock.calls[0][1]?.directive).toHaveLength(200);
  });

  it("answers 415 to another media type without a log", async () => {
    const response = await call("{}", "application/json");

    expect(response.status).toBe(415);
    expect(reportInfo).not.toHaveBeenCalled();
  });

  it("answers 400 to a body that is not JSON", async () => {
    const response = await call("{not json");

    expect(response.status).toBe(400);
    expect(reportInfo).not.toHaveBeenCalled();
  });

  it("answers 413 to a body over 8 KiB without a declared length", async () => {
    const response = await call(JSON.stringify({ "csp-report": { "script-sample": "x".repeat(9000) } }));

    expect(response.status).toBe(413);
    expect(reportInfo).not.toHaveBeenCalled();
  });

  it("answers 413 to a declared length over 8 KiB before reading the body", async () => {
    const response = await call("{}", "application/csp-report", { "Content-Length": "100000" });

    expect(response.status).toBe(413);
    expect(reportInfo).not.toHaveBeenCalled();
  });

  it("masks an invite code and an e-mail address in the logged path and drops a free-text directive", async () => {
    await call(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://streakboard.app/join/abc123",
          "effective-directive": "script-src\nforged line",
          "blocked-uri": "inline",
        },
      }),
    );
    await call(
      JSON.stringify({
        "csp-report": { "document-uri": "https://streakboard.app/x/a@b.com", "effective-directive": "img-src" },
      }),
    );

    expect(vi.mocked(reportInfo).mock.calls).toEqual([
      ["csp.violation", { directive: "", blocked: "inline", path: "/join/[code]" }],
      ["csp.violation", { directive: "img-src", blocked: "", path: "/x/[email]" }],
    ]);
  });

  it("logs at most five violations from one batch", async () => {
    const entry = {
      type: "csp-violation",
      body: { effectiveDirective: "img-src", documentURL: "https://streakboard.app/" },
    };
    const response = await call(JSON.stringify(Array.from({ length: 6 }, () => entry)), "application/reports+json");

    expect(response.status).toBe(204);
    expect(reportInfo).toHaveBeenCalledTimes(5);
  });
});
