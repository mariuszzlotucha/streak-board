// Shared constants for the runtime-probe harness: ports, fixture ids, a signed-in session cookie that needs no real
// Auth server, and canned PostgREST / GoTrue failure bodies. Zero dependencies.
import { Buffer } from "node:buffer";

export const APP_PORT = 4399;
export const STUB_PORT = 54399;
export const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;

// @supabase/ssr reads `sb-<first hostname label of SUPABASE_URL>-auth-token`; for 127.0.0.1 the label is "127".
export const COOKIE_NAME = "sb-127-auth-token";

export const IDS = {
  user: "11111111-1111-4111-8111-111111111111",
  group: "22222222-2222-4222-8222-222222222222",
  task: "33333333-3333-4333-8333-333333333333",
  unknownTask: "00000000-0000-4000-8000-000000000000",
};
export const EMAIL = "probe@example.test";
export const GROUP_NAME = "Probe Crew";
export const JOIN_CODE = "abc123def456";
export const FAR_FUTURE = 4102444800; // 2100-01-01, so auth-js never tries to refresh the token
export const LONG_AGO = 1700000000; // 2023-11-14: an access token that expired long ago, so auth-js refreshes it

// The fake anon key written to .env / .dev.vars as SUPABASE_KEY (what supabase-js sends as Bearer when it has no session).
export const FAKE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJwcm9iZS1mYWtlIiwicm9sZSI6ImFub24iLCJleHAiOjQxMDI0NDQ4MDB9.ZmFrZS1wcm9iZS1zaWduYXR1cmU";
export const REFRESH_TOKEN = "probe-refresh-token";
export const NEW_REFRESH_TOKEN = "probe-refresh-token-2";

const b64url = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

const jwt = (exp, signature) =>
  [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({ sub: IDS.user, role: "authenticated", aud: "authenticated", exp, session_id: "probe-session" }),
    b64url(signature),
  ].join(".");

export const ACCESS_TOKEN = jwt(FAR_FUTURE, "probe-signature");
export const EXPIRED_ACCESS_TOKEN = jwt(LONG_AGO, "probe-signature-expired");

export const FAKE_USER = {
  id: IDS.user,
  aud: "authenticated",
  role: "authenticated",
  email: EMAIL,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "",
  confirmed_at: "2026-01-01T00:00:00Z",
  last_sign_in_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_anonymous: false,
};

/** The `Cookie` value of a signed-in browser: `base64-` + base64url(JSON session), as @supabase/ssr writes it. */
export function sessionCookie({ accessToken = ACCESS_TOKEN, expiresAt = FAR_FUTURE } = {}) {
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: REFRESH_TOKEN,
    user: FAKE_USER,
  };
  return `${COOKIE_NAME}=base64-${b64url(session)}`;
}

/** A signed-in browser whose access token expired long ago: the first Supabase call has to refresh the session. */
export const expiredSessionCookie = () => sessionCookie({ accessToken: EXPIRED_ACCESS_TOKEN, expiresAt: LONG_AGO });

/** What GoTrue answers to a successful `POST /auth/v1/token?grant_type=refresh_token`. */
export const refreshedSession = () => ({
  access_token: ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: FAR_FUTURE,
  refresh_token: NEW_REFRESH_TOKEN,
  user: FAKE_USER,
});

// ---- canned failure bodies -------------------------------------------------------------------------------------
// PostgREST answers errors as {code, details, hint, message}; `status` is what PostgREST maps the SQLSTATE to.
const pg = (status, code, message, details = null, hint = null) => ({
  mode: "status",
  status,
  body: { code, details, hint, message },
});

export const PG = {
  internal500: pg(500, "XX000", "internal error: probe injected failure"),
  rls403: (table) => pg(403, "42501", `new row violates row-level security policy for table "${table}"`),
  rls403Plain: pg(403, "42501", "permission denied for table task_checkoffs"),
  dup409: pg(
    409,
    "23505",
    'duplicate key value violates unique constraint "task_checkoffs_pkey"',
    `Key (task_id, user_id, period)=(${IDS.task}, ${IDS.user}, 2026-10-02) already exists.`,
  ),
  fk409: pg(
    409,
    "23503",
    'insert or update on table "task_checkoffs" violates foreign key constraint "task_checkoffs_task_id_user_id_fkey"',
    `Key (task_id, user_id)=(${IDS.task}, ${IDS.user}) is not present in table "task_participants".`,
  ),
  p0002: pg(404, "P0002", "invalid join code"),
  jwtExpired401: pg(401, "PGRST301", "JWT expired"),
  // What PostgREST answers while its schema cache is loading or the DB is down (a real 503 would carry Retry-After).
  schemaCache503: pg(
    503,
    "PGRST002",
    "Could not query the database for the schema cache. Retrying.",
    null,
    "Try again later",
  ),
  // A gateway in front of PostgREST (Cloudflare / Kong) answering HTML, not JSON.
  gatewayHtml502: {
    mode: "status",
    status: 502,
    contentType: "text/html; charset=utf-8",
    body: "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>",
  },
  reset: { mode: "reset" },
  empty: { mode: "empty" },
  hang: { mode: "hang" },
  slow: (delayMs) => ({ mode: "slow", delayMs }),
};

// GoTrue answers errors as {code, error_code, msg}.
export const AUTH = {
  unavailable503: {
    mode: "status",
    status: 503,
    body: { code: 503, error_code: "unexpected_failure", msg: "Service Unavailable" },
  },
  internal500: {
    mode: "status",
    status: 500,
    body: { code: 500, error_code: "unexpected_failure", msg: "Database error querying schema" },
  },
  gatewayHtml502: PG.gatewayHtml502,
  badJwt401: {
    mode: "status",
    status: 401,
    body: { code: 401, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" },
  },
  // Refresh-token rejection (rotation reuse / revoked): a non-retryable 400 for auth-js.
  refresh400: {
    mode: "status",
    status: 400,
    body: { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" },
  },
  reset: { mode: "reset" },
  slow: (delayMs) => ({ mode: "slow", delayMs }),
  hang: { mode: "hang" },
};
