import type { APIContext } from "astro";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/log";
import { POST } from "@/pages/api/client-errors";

vi.mock("@/lib/log", () => ({
  reportError: vi.fn(),
  requestFields: vi.fn(() => ({ route: "/api/client-errors", userId: null, ray: null })),
}));

function call(body: string, contentType = "text/plain;charset=UTF-8") {
  const headers = new Headers({ "Content-Type": contentType });
  const request = new Request("http://localhost/api/client-errors", { method: "POST", headers, body });
  return POST({ request, routePattern: "/api/client-errors", locals: { user: null } } as unknown as APIContext);
}

afterEach(() => {
  vi.mocked(reportError).mockReset();
});

describe("POST /api/client-errors", () => {
  it.each(["sw_register_failed", "sw_update_failed"])("reports the known code %s and answers 204", async (code) => {
    const response = await call(code);

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(reportError).toHaveBeenCalledOnce();
    expect(vi.mocked(reportError).mock.calls[0][0]).toBe(`client.sw.${code}`);
    expect((vi.mocked(reportError).mock.calls[0][1] as Error).message).toBe(code);
  });

  it("answers 415 to a JSON body without a report", async () => {
    const response = await call(JSON.stringify({ code: "sw_register_failed" }), "application/json");

    expect(response.status).toBe(415);
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown code", "sw_exploded"],
    ["an empty body", ""],
  ])("answers 400 to %s without a report", async (_label, body) => {
    const response = await call(body);

    expect(response.status).toBe(400);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("answers 413 to a body over 256 bytes without a declared length, without a report", async () => {
    const response = await call(`sw_register_failed${" ".repeat(300)}`);

    expect(response.status).toBe(413);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("answers 413 to a declared length over 256 bytes before reading the body", async () => {
    const request = new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "Content-Length": "100000" },
      body: "sw_register_failed",
    });
    const read = vi.spyOn(request, "arrayBuffer");
    const response = await POST({ request, routePattern: "/api/client-errors", locals: { user: null } } as never);

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});
