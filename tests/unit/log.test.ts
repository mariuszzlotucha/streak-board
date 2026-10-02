import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { reportError, reportInfo, reportMapped, requestFields } from "@/lib/log";

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

type Payload = { error: Record<string, unknown> } & Record<string, unknown>;
const loggedError = (): Payload => errorSpy.mock.calls[0][0] as Payload;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportError", () => {
  it("writes one object through console.error with the context and an Error's name, message and stack", () => {
    reportError("x.failed", new TypeError("boom"), { route: "/api/x", userId: "u1", ray: "r1" });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(infoSpy).not.toHaveBeenCalled();
    const payload = loggedError();
    expect(payload).toMatchObject({
      level: "error",
      event: "x.failed",
      route: "/api/x",
      userId: "u1",
      ray: "r1",
      error: { name: "TypeError", message: "boom" },
    });
    expect(payload.error.stack).toContain("boom");
  });

  it("reads message, details, hint and code from a PostgREST-shaped object", () => {
    reportError("x.failed", { message: "oops", details: "d", hint: "h", code: "XX000" });

    expect(loggedError().error).toEqual({ message: "oops", details: "d", hint: "h", code: "XX000" });
  });

  it("reads and scrubs details and hint of an Error instance such as PostgrestError", () => {
    const error = Object.assign(new Error("duplicate"), {
      details: "Key (join_code)=(abc123) already exists.",
      hint: "h",
      code: "23505",
    });
    reportError("x.failed", error);

    expect(loggedError().error).toMatchObject({
      details: "Key (join_code)=(…) already exists.",
      hint: "h",
      code: "23505",
    });
  });

  it("keeps code and status of an Auth network failure", () => {
    reportError("auth.unavailable", new AuthRetryableFetchError("fetch failed", 0));

    expect(loggedError().error).toMatchObject({
      name: "AuthRetryableFetchError",
      message: "fetch failed",
      status: 0,
    });
  });

  it("describes a string", () => {
    reportError("x.failed", "plain text");

    expect(loggedError().error).toEqual({ message: "plain text" });
  });

  it("redacts key values and masks e-mail addresses", () => {
    reportError("x.failed", {
      message: "mail jane@example.com rejected",
      details: "Key (join_code)=(abc123) already exists.",
    });

    const { error } = loggedError();
    expect(error.message).toBe("mail [email] rejected");
    expect(error.details).toBe("Key (join_code)=(…) already exists.");
  });

  it("leaves out a null details and an empty hint", () => {
    reportError("x.failed", { message: "m", details: null, hint: "" });

    expect(loggedError().error).toEqual({ message: "m" });
  });

  it("cuts message and details to 500 characters", () => {
    reportError("x.failed", { message: "m".repeat(900), details: "d".repeat(900) });

    const { error } = loggedError();
    expect(error.message).toHaveLength(500);
    expect(error.details).toHaveLength(500);
  });

  it("returns and logs the last-resort line when building the payload throws", () => {
    const hostile = {
      get message(): string {
        throw new Error("getter exploded");
      },
    };

    expect(() => {
      reportError("x.failed", hostile);
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("report.failed", "x.failed");
  });
});

describe("reportInfo", () => {
  it("writes one object through console.info", () => {
    reportInfo("x.stale", { userId: "u1", taskId: "t1" });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledExactlyOnceWith({ level: "info", event: "x.stale", userId: "u1", taskId: "t1" });
  });
});

describe("reportMapped", () => {
  it.each([
    ["unknown", "error"],
    ["forbidden", "error"],
    ["rate_limited", "info"],
    ["invalid_code", "none"],
  ])("maps %s to %s", (code, level) => {
    reportMapped("x.failed", code, { message: "m", code: "42501" }, { status: 500 });

    expect(errorSpy).toHaveBeenCalledTimes(level === "error" ? 1 : 0);
    expect(infoSpy).toHaveBeenCalledTimes(level === "info" ? 1 : 0);
    if (level === "error") {
      expect(loggedError()).toMatchObject({ event: "x.failed", outcome: code, status: 500 });
    }
  });
});

describe("requestFields", () => {
  it("reads the route pattern, the user id and cf-ray", () => {
    const request = new Request("https://app.test/join/secret", { headers: { "cf-ray": "abc-WAW" } });

    expect(requestFields({ request, routePattern: "/join/[code]", locals: { user: { id: "u1" } } })).toEqual({
      route: "/join/[code]",
      userId: "u1",
      ray: "abc-WAW",
    });
    expect(
      requestFields({ request: new Request("https://app.test/"), routePattern: "/", locals: { user: null } }),
    ).toEqual({ route: "/", userId: null, ray: null });
  });
});
