import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolveAuthState, unavailableResponse } from "@/lib/auth-state";
import type { createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

function clientReturning(result: unknown): Client {
  return { auth: { getUser: () => Promise.resolve(result) } } as unknown as Client;
}

const user = { id: "u1" };

describe("resolveAuthState", () => {
  it("is not_configured without a client", async () => {
    expect(await resolveAuthState(null)).toEqual({ kind: "not_configured" });
  });

  it("is signed_in when a user comes back", async () => {
    expect(await resolveAuthState(clientReturning({ data: { user }, error: null }))).toEqual({
      kind: "signed_in",
      user,
    });
  });

  it("is anonymous without a user and without an error", async () => {
    expect(await resolveAuthState(clientReturning({ data: { user: null }, error: null }))).toEqual({
      kind: "anonymous",
    });
  });

  it("is anonymous for AuthSessionMissingError", async () => {
    const state = await resolveAuthState(
      clientReturning({ data: { user: null }, error: new AuthSessionMissingError() }),
    );
    expect(state.kind).toBe("anonymous");
  });

  // Every code the module lists as "this session is gone" (src/lib/auth-state.ts, SESSION_GONE_CODES): a signed-out
  // visitor, not a fault to report.
  it.each([
    "bad_jwt",
    "session_not_found",
    "session_expired",
    "refresh_token_not_found",
    "refresh_token_already_used",
    "user_not_found",
    "no_authorization",
  ])("is anonymous for a 401 %s", async (code) => {
    const error = new AuthApiError("gone", 401, code);
    expect((await resolveAuthState(clientReturning({ data: { user: null }, error }))).kind).toBe("anonymous");
  });

  it("is unexpected for a 401 without a code", async () => {
    const error = new AuthApiError("nope", 401, undefined);
    expect(await resolveAuthState(clientReturning({ data: { user: null }, error }))).toEqual({
      kind: "unexpected",
      error,
    });
  });

  it("is unexpected for a 4xx with a code that does not mean the session is gone", async () => {
    // "anything else: treated as anonymous, but reported" (the AuthState comment), so the error must come back
    const error = new AuthApiError("nope", 422, "validation_failed");
    expect(await resolveAuthState(clientReturning({ data: { user: null }, error }))).toEqual({
      kind: "unexpected",
      error,
    });
  });

  it.each([0, 503])("is unavailable for AuthRetryableFetchError with status %s", async (status) => {
    const error = new AuthRetryableFetchError("fetch failed", status);
    expect(await resolveAuthState(clientReturning({ data: { user: null }, error }))).toEqual({
      kind: "unavailable",
      error,
    });
  });

  it("is unavailable for an AuthApiError with status 500", async () => {
    const error = new AuthApiError("boom", 500, undefined);
    expect((await resolveAuthState(clientReturning({ data: { user: null }, error }))).kind).toBe("unavailable");
  });

  it("lets a non-Auth error thrown by getUser propagate", async () => {
    const client = {
      auth: { getUser: () => Promise.reject(new TypeError("bug")) },
    } as unknown as Client;
    await expect(resolveAuthState(client)).rejects.toThrow("bug");
  });
});

describe("unavailableResponse", () => {
  it("answers JSON for Accept: application/json", async () => {
    const response = unavailableResponse(
      new Request("https://app.test/api/tasks/checkoff", { headers: { Accept: "application/json" } }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
  });

  it("answers a minimal HTML page otherwise", async () => {
    const response = unavailableResponse(new Request("https://app.test/dashboard"));

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain("<title>Service unavailable</title>");
  });
});
