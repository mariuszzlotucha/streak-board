import { isAuthRetryableFetchError, isAuthSessionMissingError, type AuthError, type User } from "@supabase/supabase-js";
import { wantsJson } from "@/lib/http";
import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export type AuthState =
  | { kind: "signed_in"; user: User }
  | { kind: "anonymous" } // no session, or a session Auth reports as gone
  | { kind: "unavailable"; error: AuthError } // Auth service failure: network failure (retryable fetch error) or status >= 500
  | { kind: "unexpected"; error: AuthError } // anything else: treated as anonymous, but reported
  | { kind: "not_configured" }; // createClient returned null

// Auth error codes that mean "this session is gone": the visitor is signed out, nothing is wrong with the service.
const SESSION_GONE_CODES = new Set([
  "bad_jwt",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "user_not_found",
  "no_authorization",
]);

/**
 * Classifies what `getUser()` returned. Every anonymous visitor gets `AuthSessionMissingError`, which is normal and
 * stays `anonymous`; only a service failure is `unavailable`. A non-Auth error thrown by `getUser()` propagates.
 */
export async function resolveAuthState(supabase: Supabase | null): Promise<AuthState> {
  if (!supabase) return { kind: "not_configured" };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user) return { kind: "signed_in", user };
  if (!error) return { kind: "anonymous" };
  if (isAuthSessionMissingError(error)) return { kind: "anonymous" };
  if (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500) return { kind: "unavailable", error };
  if (error.code && SESSION_GONE_CODES.has(error.code)) return { kind: "anonymous" };
  return { kind: "unexpected", error };
}

const UNAVAILABLE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Service unavailable</title>
  </head>
  <body>
    <h1>Service unavailable</h1>
    <p>Sign-in is temporarily unavailable. Please try again in a moment.</p>
  </body>
</html>
`;

/** The 503 a protected request gets while the Auth service is unreachable. */
export function unavailableResponse(request: Request): Response {
  const headers = { "Retry-After": "30", "Cache-Control": "no-store" };
  if (wantsJson(request.headers)) {
    return new Response(JSON.stringify({ ok: false, error: "unavailable" }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
  return new Response(UNAVAILABLE_PAGE, {
    status: 503,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
