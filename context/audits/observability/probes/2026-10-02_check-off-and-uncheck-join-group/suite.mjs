#!/usr/bin/env node
// Runtime-probe suite: which production failures are visible vs missed in StreakBoard (check-off/uncheck and join-group).
// Zero dependencies. Boots the PRODUCTION build on the Cloudflare runtime emulator (`npm run build` + `npm run preview`,
// i.e. workerd via Miniflare, NOT `astro dev`) against the fake Supabase in probe/fake-supabase.mjs, fires every probe and
// records, per probe: HTTP status, Location, Set-Cookie NAMES, body snippet, alert/notes, the slice of preview-process
// console output produced during the probe, and the requests the stub saw.
//
//   node probe/suite.mjs [--skip-build] [--only C1,J,P9] [--run <name>] [--no-env] [--list]
//
// Output: probe/out/<run>/{results.json,results.md,preview.log,stub-requests.jsonl,stub-process.log,build.log}.
// Touches only this worktree, ports 4399 (app) and 54399 (stub). Kills every process it starts (process group, its
// descendants, and any leftover whose cwd is inside this worktree) and verifies with `ss` that both ports are free.
//
// Needs `.env` and `.dev.vars` with SUPABASE_URL=http://127.0.0.1:54399 and a fake SUPABASE_KEY (both git-ignored; the
// suite writes them when missing, and the build copies .dev.vars to dist/server/.dev.vars, which the preview reads).
// The probe-only code lives in src/pages/api/probe.ts, src/pages/probe-stream.astro and a header-gated throw at the top
// of src/middleware.ts; one build serves every probe. To run under another Node, put it first on PATH, e.g.
//   PATH=/path/to/node22/node_modules/.bin:$PATH node probe/suite.mjs --run node22
import { spawn, spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  APP_PORT,
  AUTH,
  BASE_URL,
  IDS,
  JOIN_CODE,
  PG,
  STUB_PORT,
  STUB_URL,
  FAKE_KEY,
  expiredSessionCookie,
  sessionCookie,
} from "./fixtures.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const { values: args } = parseArgs({
  options: {
    "skip-build": { type: "boolean", default: false },
    only: { type: "string" },
    run: { type: "string" },
    "no-env": { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const RUN = args.run ?? stamp;
const OUT = path.join(ROOT, "probe", "out", RUN);
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const SAFE_ENV = {
  NO_COLOR: "1",
  FORCE_COLOR: "0",
  ASTRO_TELEMETRY_DISABLED: "1",
  WRANGLER_SEND_METRICS: "false",
  DO_NOT_TRACK: "1",
};

// ---- probe catalog ---------------------------------------------------------------------------------------------------
// req: {method, path, form, json, rawBody, contentType, headers, session (default true), cookies, timeoutMs}
const T = IDS.task;
const checkoff = (extra = {}) => ({ method: "POST", path: "/api/tasks/checkoff", form: { task_id: T }, json: true, ...extra });
const uncheck = (extra = {}) => ({ method: "POST", path: "/api/tasks/uncheck", form: { task_id: T }, json: true, ...extra });
const dashboard = (extra = {}) => ({ method: "GET", path: "/dashboard", ...extra });
const join = (extra = {}) => ({
  method: "POST",
  path: "/api/groups/join",
  form: { code: JOIN_CODE },
  cookies: [`join_code=${JOIN_CODE}`],
  ...extra,
});
const probeRoute = (mode, extra = {}) => ({ method: "GET", path: `/api/probe?mode=${mode}`, session: false, ...extra });

const groupMemberDup = {
  mode: "status",
  status: 409,
  body: {
    code: "23505",
    details: `Key (user_id)=(${IDS.user}) already exists.`,
    hint: null,
    message: 'duplicate key value violates unique constraint "group_members_user_id_key"',
  },
};

const MAIN = [
  // ---- priority 1: controls --------------------------------------------------------------------------------------
  { id: "C0a", flow: "check-off", title: "control: check-off happy path (JSON)", shape: "no failure", req: checkoff() },
  { id: "C0b", flow: "check-off", title: "control: uncheck happy path (JSON)", shape: "no failure", req: uncheck() },
  { id: "C0c", flow: "dashboard", title: "control: dashboard happy path", shape: "no failure", req: dashboard() },
  { id: "J0", flow: "join", title: "control: join with valid code", shape: "no failure", req: join() },

  // ---- priority 2: Auth outage / unreachable (C1, C2) ------------------------------------------------------------
  { id: "C1a", flow: "check-off", title: "Auth 503 JSON on getUser, check-off (JSON mode)", shape: "auth outage: getUser returns {error}, middleware discards it", stub: { auth_user: AUTH.unavailable503 }, req: checkoff() },
  { id: "C1b", flow: "dashboard", title: "Auth 503 JSON on getUser, GET /dashboard", shape: "auth outage", stub: { auth_user: AUTH.unavailable503 }, req: dashboard() },
  { id: "C1c", flow: "check-off", title: "Auth 503 JSON on getUser, plain form POST (no Accept JSON)", shape: "auth outage", stub: { auth_user: AUTH.unavailable503 }, req: checkoff({ json: false }) },
  { id: "C1d", flow: "check-off", title: "Auth 502 HTML (gateway) on getUser, check-off (JSON)", shape: "auth outage, non-JSON body", stub: { auth_user: AUTH.gatewayHtml502 }, req: checkoff() },
  { id: "C1e", flow: "check-off", title: "Auth 500 JSON on getUser, check-off (JSON)", shape: "auth internal error", stub: { auth_user: AUTH.internal500 }, req: checkoff() },
  { id: "C1f", flow: "check-off", title: "Auth 401 bad_jwt on getUser (genuinely invalid session), check-off (JSON)", shape: "control: real sign-out looks identical to an outage", stub: { auth_user: AUTH.badJwt401 }, req: checkoff() },
  { id: "C2a", flow: "check-off", title: "Auth connection reset on getUser, check-off (JSON)", shape: "auth unreachable (RST)", stub: { auth_user: AUTH.reset }, req: checkoff() },
  { id: "C2e", flow: "dashboard", title: "Auth connection reset on getUser, GET /dashboard", shape: "auth unreachable (RST)", stub: { auth_user: AUTH.reset }, req: dashboard() },
  { id: "C2c", flow: "check-off", title: "Auth/PostgREST stub fully stopped (ECONNREFUSED), check-off (JSON)", shape: "auth host down", stubOff: true, req: checkoff() },
  { id: "C2d", flow: "dashboard", title: "stub fully stopped (ECONNREFUSED), GET /dashboard", shape: "auth host down", stubOff: true, req: dashboard() },
  { id: "C2b", flow: "check-off", title: "Auth slow: getUser answers after 12 s, check-off (JSON)", shape: "auth slow", stub: { auth_user: AUTH.slow(12000) }, req: checkoff({ timeoutMs: 30000 }) },
  { id: "C2h", flow: "check-off", title: "Auth hangs (never answers), client gives up after 25 s", shape: "auth hang", stub: { auth_user: AUTH.hang }, req: checkoff({ timeoutMs: 25000 }), releaseHangs: true },

  // ---- priority 3: PostgREST on the check-off writes (C4, C5, C6) ------------------------------------------------
  { id: "C4", flow: "check-off", title: "task_checkoffs insert answers 500", shape: "PostgREST 500: supabase-js returns {error}, outcome unknown", stub: { checkoffs_insert: PG.internal500 }, req: checkoff() },
  { id: "C5", flow: "check-off", title: "task_checkoffs insert: network reset", shape: "postgrest-js returns {error:{code:''}, status:0}", stub: { checkoffs_insert: PG.reset }, req: checkoff() },
  { id: "C6", flow: "check-off", title: "task_checkoffs insert answers 403 / 42501 (RLS refusal)", shape: "RLS/permission failure mapped to forbidden", stub: { checkoffs_insert: PG.rls403("task_checkoffs") }, req: checkoff() },
  { id: "C6b", flow: "check-off", title: "task_checkoffs insert answers 401 PGRST301 JWT expired", shape: "expired access token at PostgREST", stub: { checkoffs_insert: PG.jwtExpired401 }, req: checkoff() },
  { id: "C7", flow: "check-off", title: "task_checkoffs insert answers 409 / 23503 (not enrolled)", shape: "FK violation mapped to forbidden", stub: { checkoffs_insert: PG.fk409 }, req: checkoff() },
  { id: "C7b", flow: "check-off", title: "task_checkoffs insert answers 409 / 23505 (already ticked)", shape: "idempotent no-op", stub: { checkoffs_insert: PG.dup409 }, req: checkoff() },

  // ---- priority 4: undo with zero rows (C9, C10) -----------------------------------------------------------------
  { id: "C9", flow: "check-off", title: "uncheck: DELETE answers 200 with [] (zero rows deleted)", shape: "nothing deleted reported as ok", stub: { checkoffs_delete: PG.empty }, req: uncheck() },
  { id: "C10", flow: "check-off", title: "uncheck: DELETE answers 500", shape: "PostgREST 500 on delete", stub: { checkoffs_delete: PG.internal500 }, req: uncheck() },
  { id: "C10b", flow: "check-off", title: "uncheck: DELETE network reset", shape: "network failure on delete", stub: { checkoffs_delete: PG.reset }, req: uncheck() },

  // ---- priority 5: join-group (J1, J2, J6) -----------------------------------------------------------------------
  { id: "J1", flow: "join", title: "join_group RPC answers 500", shape: "PostgREST 500 returned as {error}, route maps it to a redirect", stub: { rpc_join_group: PG.internal500 }, req: join() },
  { id: "J2", flow: "join", title: "join_group RPC: network reset", shape: "network failure returned as {error:{code:''}}", stub: { rpc_join_group: PG.reset }, req: join() },
  { id: "J3", flow: "join", title: "join_group RPC answers P0002 (invalid code)", shape: "legit business error", stub: { rpc_join_group: PG.p0002 }, req: join() },
  { id: "J3b", flow: "join", title: "join with a malformed code in the form (no RPC call)", shape: "validation", req: join({ form: { code: "zzz" }, cookies: ["join_code=abc123def456"] }) },
  { id: "J4", flow: "join", title: "join_group RPC answers 23505 (already in a group)", shape: "legit business error", stub: { rpc_join_group: groupMemberDup }, req: join() },
  { id: "J5", flow: "join", title: "join_group RPC answers 403 / 42501", shape: "permission failure mapped to forbidden", stub: { rpc_join_group: PG.rls403Plain }, req: join() },
  { id: "J6a", flow: "join", title: "GET /join/zzz (malformed invite link), signed in", shape: "malformed invite code", req: { method: "GET", path: "/join/zzz" } },
  { id: "J6b", flow: "join", title: `GET /join/${JOIN_CODE} (valid hex), signed in`, shape: "valid invite code", req: { method: "GET", path: `/join/${JOIN_CODE}` } },
  { id: "J6c", flow: "join", title: "GET /join/<65 hex chars> (too long), signed in", shape: "malformed invite code", req: { method: "GET", path: `/join/${"a".repeat(65)}` } },
  { id: "J6d", flow: "join", title: `GET /join/${JOIN_CODE} signed out (public route)`, shape: "valid invite code, no session", req: { method: "GET", path: `/join/${JOIN_CODE}`, session: false } },

  // ---- priority 6: platform shapes (P1, P5, P9) ------------------------------------------------------------------
  { id: "P1", flow: "platform", title: "P1 throw in a handler (/api/probe?mode=throw)", shape: "exception escapes the handler", req: probeRoute("throw") },
  { id: "P1b", flow: "platform", title: "P1b throw with a cause", shape: "Error with cause escapes the handler", req: probeRoute("throw-cause") },
  { id: "P1c", flow: "platform", title: "P1c throw a plain object (as supabase-js errors are)", shape: "non-Error thrown", req: probeRoute("throw-plain") },
  { id: "P5a", flow: "platform", title: "P5 throw in early middleware, GET /", shape: "middleware throws before getUser", req: { method: "GET", path: "/", session: false, headers: { "x-probe": "throw-mw" } } },
  { id: "P5b", flow: "platform", title: "P5b throw in early middleware, POST /api/tasks/checkoff (JSON)", shape: "middleware throws before the route's own typed error handling", req: checkoff({ headers: { "x-probe": "throw-mw" } }) },
  { id: "P9a", flow: "platform", title: "P9 console.error('label', new Error(msg, {cause}))", shape: "Error with cause passed as a console argument", req: probeRoute("log-error") },
  { id: "P9b", flow: "platform", title: "P9 console.error('label', {message,details,hint,code}) (PostgREST-shaped plain object)", shape: "plain object passed as a console argument", req: probeRoute("log-plain") },
  { id: "P9c", flow: "platform", title: "P9 console.error(`label ${error}`) (template string)", shape: "error interpolated into a string", req: probeRoute("log-string") },
  { id: "P9d", flow: "platform", title: "P9 console.error(new Error(msg)) (Error alone)", shape: "Error as the only console argument", req: probeRoute("log-error-only") },
  { id: "P9e", flow: "platform", title: "P9 console.error('label', JSON.stringify(error))", shape: "error JSON-stringified", req: probeRoute("log-json") },

  // ---- priority 7: the rest of the check-off catalog -------------------------------------------------------------
  { id: "C3a", flow: "check-off", title: "tasks read (getTask) answers 500, check-off", shape: "PostgREST 500; getTask throws the plain error object", stub: { tasks_get: PG.internal500 }, req: checkoff() },
  { id: "C3b", flow: "check-off", title: "tasks read answers 503 PGRST002 (postgrest-js retries GETs)", shape: "PostgREST schema-cache 503, retried 3x with backoff", stub: { tasks_get: PG.schemaCache503 }, req: checkoff({ timeoutMs: 40000 }) },
  { id: "C3c", flow: "check-off", title: "tasks read: network reset (postgrest-js retries GETs)", shape: "network failure on GET, retried 3x with backoff", stub: { tasks_get: PG.reset }, req: checkoff({ timeoutMs: 40000 }) },
  { id: "C3d", flow: "check-off", title: "tasks read answers 500, uncheck", shape: "PostgREST 500; getTask throws", stub: { tasks_get: PG.internal500 }, req: uncheck() },
  { id: "C3e", flow: "check-off", title: "tasks read answers 502 HTML gateway page, check-off", shape: "non-JSON error body: error has a message but no code", stub: { tasks_get: PG.gatewayHtml502 }, req: checkoff() },
  { id: "C8", flow: "check-off", title: "tasks read returns zero rows, check-off", shape: "RLS-hidden or deleted task: gone", stub: { tasks_get: PG.empty }, req: checkoff() },
  { id: "C8b", flow: "check-off", title: "tasks read returns zero rows, uncheck", shape: "RLS-hidden or deleted task: gone", stub: { tasks_get: PG.empty }, req: uncheck() },
  { id: "C11a", flow: "check-off", title: "non-form body (application/json {}) on check-off", shape: "request.formData() throws", req: checkoff({ form: undefined, rawBody: "{}", contentType: "application/json" }) },
  { id: "C11b", flow: "check-off", title: "non-form body (application/json {}) on uncheck", shape: "request.formData() throws", req: uncheck({ form: undefined, rawBody: "{}", contentType: "application/json" }) },
  { id: "C12a", flow: "check-off", title: "plain form POST, ok", shape: "no failure; redirect target", req: checkoff({ json: false }) },
  { id: "C12b", flow: "check-off", title: "plain form POST, insert answers 500", shape: "redirect target on unknown", stub: { checkoffs_insert: PG.internal500 }, req: checkoff({ json: false }) },
  { id: "C12c", flow: "check-off", title: "plain form POST, insert answers 403 / 42501", shape: "redirect target on forbidden", stub: { checkoffs_insert: PG.rls403("task_checkoffs") }, req: checkoff({ json: false }) },
  { id: "C12d", flow: "check-off", title: "plain form POST, task gone (zero rows)", shape: "redirect target on gone", stub: { tasks_get: PG.empty }, req: checkoff({ json: false }) },
  { id: "C12e", flow: "check-off", title: "plain form POST uncheck, DELETE answers 500", shape: "redirect target on unknown", stub: { checkoffs_delete: PG.internal500 }, req: uncheck({ json: false }) },

  // ---- C13: dashboard reads --------------------------------------------------------------------------------------
  { id: "C13a", flow: "dashboard", title: "dashboard: list_group_members RPC answers 500", shape: "essential read fails: outer catch", stub: { rpc_list_group_members: PG.internal500 }, req: dashboard() },
  { id: "C13b", flow: "dashboard", title: "dashboard: tasks list answers 500", shape: "secondary read fails (allSettled)", stub: { tasks_list: PG.internal500 }, req: dashboard() },
  { id: "C13c", flow: "dashboard", title: "dashboard: task_participants list answers 500", shape: "secondary read fails (allSettled)", stub: { participants_list: PG.internal500 }, req: dashboard() },
  { id: "C13d", flow: "dashboard", title: "dashboard: task_checkoff_periods answers 500", shape: "secondary read fails (allSettled)", stub: { periods_list: PG.internal500 }, req: dashboard() },
  { id: "C13e", flow: "dashboard", title: "dashboard: getMyGroup (groups) answers 500", shape: "first read fails: outer catch", stub: { groups_get: PG.internal500 }, req: dashboard() },
  { id: "C13f", flow: "dashboard", title: "dashboard: getMyGroup network reset (GET retried 3x)", shape: "network failure on the first read", stub: { groups_get: PG.reset }, req: dashboard({ timeoutMs: 40000 }) },

  // ---- rest of the join-group catalog ----------------------------------------------------------------------------
  { id: "J7a", flow: "join", title: "GET /dashboard with join_code cookie, no group, preview_group RPC answers 500", shape: "invite preview fails: outer catch", stub: { groups_get: PG.empty, rpc_preview_group: PG.internal500 }, req: dashboard({ cookies: [`join_code=${JOIN_CODE}`] }) },
  { id: "J7b", flow: "join", title: "GET /dashboard with join_code cookie, getMyGroup answers 500", shape: "first read fails: outer catch", stub: { groups_get: PG.internal500 }, req: dashboard({ cookies: [`join_code=${JOIN_CODE}`] }) },
  { id: "J7c", flow: "join", title: "control: dashboard with join_code cookie, no group, preview ok", shape: "no failure", stub: { groups_get: PG.empty }, req: dashboard({ cookies: [`join_code=${JOIN_CODE}`] }) },
  { id: "J7d", flow: "join", title: "dashboard with join_code cookie, preview_group returns null (unknown code)", shape: "legit business error", stub: { groups_get: PG.empty, rpc_preview_group: PG.empty }, req: dashboard({ cookies: [`join_code=${JOIN_CODE}`] }) },
  { id: "J8a", flow: "join", title: "Auth 503 on POST /api/groups/join (join_code cookie)", shape: "auth outage during join", stub: { auth_user: AUTH.unavailable503 }, req: join() },
  { id: "J8b", flow: "join", title: "Auth 503 on GET /dashboard carrying join_code cookie", shape: "auth outage on the invite landing", stub: { auth_user: AUTH.unavailable503 }, req: dashboard({ cookies: [`join_code=${JOIN_CODE}`] }) },
  { id: "J9", flow: "join", title: "non-form body (application/json {}) on POST /api/groups/join", shape: "request.formData() throws", req: join({ form: undefined, rawBody: "{}", contentType: "application/json" }) },

  // ---- rest of the platform catalog ------------------------------------------------------------------------------
  { id: "P4", flow: "platform", title: "P4 handler returns 500 without throwing", shape: "5xx returned, nothing thrown", req: probeRoute("return500") },
  { id: "P7", flow: "platform", title: "P7 floating promise rejection after a 200", shape: "unhandled rejection", req: probeRoute("reject") },
  { id: "P8", flow: "platform", title: "P8 waitUntil(Promise.reject(...)) after a 200", shape: "background task fails after the response", req: probeRoute("waituntil-fail") },
  { id: "P10", flow: "platform", title: "P10 throw while the page streams (/probe-stream)", shape: "failure after the first bytes were sent", req: { method: "GET", path: "/probe-stream", session: false } },
  { id: "P3a", flow: "platform", title: "P3 POST /api/auth/signout while /auth/v1/logout answers 500", shape: "unwrapped route ignores the sign-out result", stub: { auth_logout: AUTH.internal500 }, req: { method: "POST", path: "/api/auth/signout", form: {} } },
  { id: "P3b", flow: "platform", title: "P3 POST /api/auth/signout while /auth/v1/logout is unreachable (reset)", shape: "unwrapped route ignores the sign-out result", stub: { auth_logout: AUTH.reset }, req: { method: "POST", path: "/api/auth/signout", form: {} } },
  { id: "P3c", flow: "platform", title: "control: POST /api/auth/signout, logout ok", shape: "no failure", req: { method: "POST", path: "/api/auth/signout", form: {} } },

  // ---- P13: session refresh failure silently downgrades DB calls to the anon key (emulated) ----------------------------
  // The cookie carries an EXPIRED access token + refresh token. The middleware's client and the route's own client each
  // read the REQUEST cookie, so each refreshes on its own (two POST /auth/v1/token per request). The stub lets the first
  // refresh (middleware) succeed, fails the second (route client), and makes PostgREST refuse the anon key with 42501.
  { id: "P13a", flow: "check-off", title: "P13 expired token: 2nd refresh answers 400, PostgREST refuses the anon key (check-off JSON)", shape: "getSession() error dropped, anon key sent as Bearer, 42501 on the tasks read", stub: { auth_token: { ...AUTH.refresh400, after: 1 }, rest_anon_guard: { mode: "anon_guard" } }, req: checkoff({ session: "expired" }) },
  { id: "P13b", flow: "join", title: "P13 expired token: 2nd refresh answers 400, PostgREST refuses the anon key (join_group RPC)", shape: "getSession() error dropped, anon key sent as Bearer, 42501 on the RPC", stub: { auth_token: { ...AUTH.refresh400, after: 1 }, rest_anon_guard: { mode: "anon_guard" } }, req: join({ session: "expired" }) },
  { id: "P13c", flow: "check-off", title: "P13 expired token: 2nd refresh answers 500 (retryable: auth-js backs off), anon key refused (check-off JSON)", shape: "retryable refresh failure then anon downgrade", stub: { auth_token: { ...AUTH.internal500, after: 1 }, rest_anon_guard: { mode: "anon_guard" } }, req: checkoff({ session: "expired", timeoutMs: 90000 }), waitMs: 3000 },
  { id: "P13d", flow: "check-off", title: "P13 control: expired token, both refreshes succeed (check-off JSON)", shape: "two refreshes per request, no failure", stub: { rest_anon_guard: { mode: "anon_guard" } }, req: checkoff({ session: "expired" }) },
  { id: "P13e", flow: "check-off", title: "P13 expired token: the 1st refresh (middleware) answers 400 (check-off JSON)", shape: "refresh rejected in the middleware: looks like a sign-out", stub: { auth_token: AUTH.refresh400, rest_anon_guard: { mode: "anon_guard" } }, req: checkoff({ session: "expired" }) },
  { id: "P13f", flow: "dashboard", title: "P13 expired token: 2nd refresh answers 400, GET /dashboard", shape: "anon downgrade on the dashboard reads", stub: { auth_token: { ...AUTH.refresh400, after: 1 }, rest_anon_guard: { mode: "anon_guard" } }, req: dashboard({ session: "expired" }) },
];

// P12: the Supabase secrets are unset / malformed. Run in a separate preview with other .dev.vars (no rebuild).
const ENV_CASES = [
  { id: "unset", label: "SUPABASE_URL and SUPABASE_KEY unset", vars: "PROBE_PLACEHOLDER=1\n" },
  { id: "malformed", label: "SUPABASE_URL malformed ('not-a-url')", vars: `SUPABASE_URL='not-a-url'\nSUPABASE_KEY='${FAKE_KEY}'\n` },
];
const ENV_PROBES = (c) => [
  { id: `P12a-${c}`, flow: "platform", title: "secrets visible to the Worker? (/api/probe?mode=env)", shape: "env check", req: probeRoute("env") },
  { id: `P12b-${c}`, flow: "platform", title: "GET / (landing page)", shape: "env misconfigured", req: { method: "GET", path: "/", session: false } },
  { id: `P12c-${c}`, flow: "platform", title: "GET /auth/signin", shape: "env misconfigured", req: { method: "GET", path: "/auth/signin", session: false } },
  { id: `P12d-${c}`, flow: "dashboard", title: "GET /dashboard with a session cookie", shape: "env misconfigured", req: dashboard() },
  { id: `P12e-${c}`, flow: "check-off", title: "POST /api/tasks/checkoff (JSON) with a session cookie", shape: "env misconfigured", req: checkoff() },
  { id: `P12f-${c}`, flow: "join", title: "POST /api/groups/join with a session and join_code cookie", shape: "env misconfigured", req: join() },
];

if (args.list) {
  for (const p of MAIN) console.log(`${p.id}\t${p.title}`);
  for (const c of ENV_CASES) for (const p of ENV_PROBES(c.id)) console.log(`${p.id}\t${p.title}`);
  process.exit(0);
}

const wanted = args.only ? args.only.split(",").map((s) => s.trim()).filter(Boolean) : null;
const selected = (id) => !wanted || wanted.some((w) => id === w || id.startsWith(w));

// ---- process management ------------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const STUB_LOG = path.join(OUT, "stub-requests.jsonl");
const PREVIEW_LOG = path.join(OUT, "preview.log");
fs.writeFileSync(PREVIEW_LOG, "");
const previewOut = fs.createWriteStream(PREVIEW_LOG, { flags: "a" });
/** @type {{t:number, stream:string, text:string}[]} */
const previewLines = [];
const started = []; // every child process group this suite started

function startGroup(cmd, argv, opts = {}) {
  const child = spawn(cmd, argv, { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"], ...opts });
  started.push(child);
  return child;
}

function tee(child, label, sink) {
  for (const stream of ["stdout", "stderr"]) {
    let partial = "";
    child[stream].on("data", (buf) => {
      partial += buf.toString("utf8");
      const parts = partial.split("\n");
      partial = parts.pop() ?? "";
      for (const text of parts) sink(stream, text);
    });
    child[stream].on("end", () => {
      if (partial) sink(stream, partial);
    });
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function groupAlive(child) {
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Every descendant of `rootPid` (children, grandchildren, ...), from one `ps` snapshot. */
function descendantsOf(rootPid) {
  const rows = execSync("ps -eo pid=,ppid=", { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number));
  const kids = new Map();
  for (const [pid, ppid] of rows) {
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(pid);
  }
  const found = [];
  const stack = [rootPid];
  while (stack.length) {
    for (const c of kids.get(stack.pop()) ?? []) {
      found.push(c);
      stack.push(c);
    }
  }
  return found;
}

async function stopGroup(child) {
  if (!child?.pid) return;
  // Only this child's own process tree is touched: its process group and its descendants.
  const pids = [child.pid, ...descendantsOf(child.pid)];
  const signalAll = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {}
    for (const pid of pids) {
      try {
        process.kill(pid, signal);
      } catch {}
    }
  };
  signalAll("SIGTERM");
  for (let i = 0; i < 80 && (groupAlive(child) || pids.some(pidAlive)); i++) await sleep(100);
  if (groupAlive(child) || pids.some(pidAlive)) {
    signalAll("SIGKILL");
    for (let i = 0; i < 30 && (groupAlive(child) || pids.some(pidAlive)); i++) await sleep(100);
  }
}

let stub = null;
async function startStub() {
  stub = startGroup("node", ["probe/fake-supabase.mjs", "--port", String(STUB_PORT), "--out", STUB_LOG]);
  tee(stub, "stub", (stream, text) => fs.appendFileSync(path.join(OUT, "stub-process.log"), `[${stream}] ${text}\n`));
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${STUB_URL}/__health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error("stub did not come up");
}
async function stopStub() {
  await stopGroup(stub);
  stub = null;
}
async function control(body) {
  const r = await fetch(`${STUB_URL}/__mode`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return r.json();
}

let preview = null;
async function startPreview(label) {
  const mark = `--- preview start (${label}) ---`;
  previewOut.write(`${mark}\n`);
  // Astro 7 detects AI-agent environments and then backgrounds `astro preview` (detached, JSON logs in .astro/preview.log).
  // CI and a developer terminal run it in the foreground with text logs on stdout, so strip the agent markers and force
  // the foreground mode. `--ignore-lock` skips the .astro/preview.json lock file.
  const env = { ...process.env, ...SAFE_ENV, ASTRO_PREVIEW_BACKGROUND: "1" };
  for (const key of Object.keys(env)) if (/^(CLAUDE|AI_AGENT|CODEX|CURSOR|GEMINI|OPENCODE)/i.test(key)) delete env[key];
  preview = startGroup(
    "npm",
    ["run", "preview", "--", "--port", String(APP_PORT), "--host", "127.0.0.1", "--ignore-lock"],
    { env },
  );
  tee(preview, "preview", (stream, text) => {
    const clean = text.replace(ANSI, "");
    previewLines.push({ t: Date.now(), stream, text: clean });
    previewOut.write(`[${stream}] ${text}\n`);
  });
  for (let i = 0; i < 180; i++) {
    try {
      await fetch(`${BASE_URL}/api/probe?mode=env`, { signal: AbortSignal.timeout(2000) });
      await sleep(1500); // let the readiness request's own log lines flush so they are not attributed to the first probe
      return; // any HTTP answer means the server is up (a malformed env answers 500)
    } catch {}
    if (preview.exitCode !== null) throw new Error(`preview exited early (code ${preview.exitCode}); see ${PREVIEW_LOG}`);
    await sleep(500);
  }
  throw new Error("preview did not come up within 90 s");
}
async function stopPreview() {
  await stopGroup(preview);
  preview = null;
}

function portsBusy() {
  const out = execSync("ss -ltn", { encoding: "utf8" });
  return [APP_PORT, STUB_PORT].filter((p) => new RegExp(`[:.]${p}\\s`).test(out));
}

function leftovers() {
  // Any process whose working directory is inside this worktree (workerd inherits it from Miniflare), except this suite.
  const found = [];
  for (const pid of fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
    try {
      const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
      if (!cwd.startsWith(ROOT)) continue;
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
      if (Number(pid) === process.pid || Number(pid) === process.ppid || cmd.includes("suite.mjs")) continue;
      if (/workerd|astro|fake-supabase|vite|miniflare|npm/.test(cmd)) found.push(`${pid} ${cmd.slice(0, 160)}`);
    } catch {
      // process vanished or is not ours to inspect
    }
  }
  return found;
}

// ---- request execution & analysis -------------------------------------------------------------------------------------
function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
const PHRASES = [
  "Scores are unavailable right now",
  "Participants are unavailable right now",
  "Something went wrong",
  "not valid",
  "already in a group",
  "not allowed",
  "Groups are not available",
  "You were invited with a link",
  "Create a group",
  "Join a group",
  "No tasks yet",
  "Mark done",
  "Supabase nie jest skonfigurowany",
];

function analyse(response, text, ms) {
  const setCookies = response.headers.getSetCookie().map((raw) => {
    const [pair, ...attrs] = raw.split(";");
    const name = pair.split("=")[0].trim();
    const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a) || (/^\s*expires=/i.test(a) && Date.parse(a.trim().slice(8)) < Date.now()));
    return `${name} (${expired ? "cleared" : "set"})`;
  });
  const contentType = response.headers.get("content-type") ?? "";
  const out = {
    status: response.status,
    location: response.headers.get("location") ?? "",
    setCookies,
    contentType,
    bytes: text.length,
    ms,
  };
  if (contentType.includes("text/html")) {
    const flat = stripTags(text);
    out.title = (/<title>([\s\S]*?)<\/title>/.exec(text)?.[1] ?? "").trim();
    out.hasRoleAlert = /role="alert"/.test(text);
    out.alerts = [...text.matchAll(/<div[^>]*role="alert"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]));
    out.headings = [...text.matchAll(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => stripTags(m[2]));
    out.notes = PHRASES.filter((p) => flat.includes(p));
    out.bodySnippet = flat.slice(0, 200);
  } else {
    out.hasRoleAlert = false;
    out.bodySnippet = text.replace(/\s+/g, " ").slice(0, 300);
  }
  return out;
}

async function fire(req) {
  const headers = { Origin: BASE_URL, ...req.headers };
  const cookies = [];
  if (req.session === "expired") cookies.push(expiredSessionCookie());
  else if (req.session !== false) cookies.push(sessionCookie());
  if (req.cookies) cookies.push(...req.cookies);
  if (cookies.length) headers.Cookie = cookies.join("; ");
  if (req.json) headers.Accept = "application/json";
  let body;
  if (req.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(req.form).toString();
  } else if (req.rawBody !== undefined) {
    headers["Content-Type"] = req.contentType ?? "application/json";
    body = req.rawBody;
  }
  const t0 = Date.now();
  try {
    const response = await fetch(BASE_URL + req.path, {
      method: req.method,
      redirect: "manual",
      headers,
      body,
      signal: AbortSignal.timeout(req.timeoutMs ?? 30000),
    });
    // The status and headers are kept even when the body stream dies half-way (a failure after streaming started).
    let text = "";
    let bodyError;
    try {
      text = await response.text();
    } catch (error) {
      bodyError = `${error?.name}: ${error?.message}${error?.cause ? ` (${error.cause.code ?? error.cause.message})` : ""}`;
    }
    const analysed = analyse(response, text, Date.now() - t0);
    if (bodyError) analysed.bodyError = bodyError;
    return analysed;
  } catch (error) {
    return { clientError: `${error?.name}: ${error?.message}${error?.cause ? ` (${error.cause.code ?? error.cause.message})` : ""}`, ms: Date.now() - t0 };
  }
}

// ---- running --------------------------------------------------------------------------------------------------------------
const results = [];

async function runProbe(def, phase) {
  process.stdout.write(`  ${def.id.padEnd(8)} ${def.title} ... `);
  await control({ reset: true, marker: def.id, set: def.stub ?? {} });
  if (def.stubOff) await stopStub();
  const from = previewLines.length;
  const response = await fire(def.req);
  // A hung upstream call keeps the Worker's request running after the client gave up: drop the stub's held sockets so the
  // request ends inside this probe's window and its access-log line (with the real duration) lands in this slice.
  if (def.releaseHangs) await control({ reset: true, marker: def.id });
  await sleep(def.waitMs ?? 2000);
  if (def.stubOff) {
    await startStub();
  }
  const consoleLines = previewLines.slice(from).map((l) => `[${l.stream}] ${l.text}`);
  const record = { id: def.id, phase, flow: def.flow, title: def.title, shape: def.shape, stub: def.stub ?? {}, stubStopped: Boolean(def.stubOff), request: describe(def.req), response, console: consoleLines };
  results.push(record);
  process.stdout.write(`${response.clientError ? `CLIENT ERROR ${response.clientError}` : `${response.status} ${response.location}`.trim()} (${response.ms} ms, ${consoleLines.length} console lines)\n`);
}

function describe(req) {
  return {
    method: req.method,
    path: req.path,
    accept: req.json ? "application/json" : undefined,
    contentType: req.form ? "application/x-www-form-urlencoded" : req.rawBody !== undefined ? (req.contentType ?? "application/json") : undefined,
    body: req.form ? new URLSearchParams(req.form).toString() : req.rawBody,
    session: req.session === "expired" ? "expired access token" : req.session !== false,
    extraCookies: (req.cookies ?? []).map((c) => c.split("=")[0]),
    extraHeaders: req.headers,
  };
}

function readStubLog() {
  if (!fs.existsSync(STUB_LOG)) return [];
  return fs
    .readFileSync(STUB_LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function attachStub() {
  const byProbe = new Map();
  for (const e of readStubLog()) {
    if (!e.endpoint) continue;
    const list = byProbe.get(e.probe) ?? [];
    list.push(e);
    byProbe.set(e.probe, list);
  }
  for (const r of results) {
    r.stubRequests = (byProbe.get(r.id) ?? []).map((e) => {
      const u = new URL(e.url, "http://stub");
      const retry = e.headers?.["x-retry-count"] ? ` retry#${e.headers["x-retry-count"]}` : "";
      return `${e.method} ${u.pathname}${u.search.length > 70 ? `${u.search.slice(0, 70)}...` : u.search} -> ${e.status}${e.mode && e.mode !== "ok" ? ` [${e.mode}]` : ""}${retry} (${e.ms} ms) bearer=${e.bearer ?? "?"}`;
    });
  }
}

// ---- markdown report ------------------------------------------------------------------------------------------------------
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}...` : s);

function writeReports(meta) {
  fs.writeFileSync(path.join(OUT, "results.json"), `${JSON.stringify({ meta, results }, null, 2)}\n`);
  const lines = [];
  lines.push(`# Runtime probe results (${RUN})`, "");
  lines.push("```json", JSON.stringify(meta, null, 2), "```", "");
  lines.push("| id | request | HTTP | Location | Set-Cookie | alert | console lines | stub calls |", "|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const x = r.response;
    lines.push(
      `| ${r.id} | ${cell(`${r.request.method} ${r.request.path}${r.request.accept ? " (Accept JSON)" : ""}`)} | ${x.clientError ? cell(x.clientError) : `${x.status} (${x.ms} ms)${x.bodyError ? cell(` body stream error: ${x.bodyError}`) : ""}`} | ${cell(x.location || "")} | ${cell((x.setCookies ?? []).join(", "))} | ${x.hasRoleAlert ? cell(`yes: ${(x.alerts ?? []).join(" / ")}`) : "no"} | ${r.console.length} | ${cell((r.stubRequests ?? []).length)} |`,
    );
  }
  lines.push("");
  for (const r of results) {
    const x = r.response;
    lines.push(`## ${r.id}: ${r.title}`, "");
    lines.push(`- shape: ${r.shape}`);
    lines.push(`- request: ${r.request.method} ${r.request.path}; session=${r.request.session}; extra cookies=${r.request.extraCookies.join(",") || "-"}; accept=${r.request.accept ?? "-"}; body=${r.request.body ?? "-"}`);
    lines.push(`- stub modes: ${Object.keys(r.stub).length ? JSON.stringify(r.stub) : "(all ok)"}${r.stubStopped ? " (stub process stopped during the probe)" : ""}`);
    lines.push(`- response: ${x.clientError ? `CLIENT ERROR ${x.clientError}` : `${x.status} ${x.location ? `-> ${x.location} ` : ""}[${x.contentType}] ${x.ms} ms, ${x.bytes} bytes${x.bodyError ? `; BODY STREAM ERROR ${x.bodyError}` : ""}`}`);
    if (x.setCookies?.length) lines.push(`- Set-Cookie names: ${x.setCookies.join(", ")}`);
    if (x.title !== undefined) lines.push(`- html: title=${JSON.stringify(x.title)} headings=${JSON.stringify(x.headings)} role=alert=${x.hasRoleAlert} alerts=${JSON.stringify(x.alerts)} notes=${JSON.stringify(x.notes)}`);
    if (x.bodySnippet !== undefined) lines.push(`- body: ${JSON.stringify(cut(x.bodySnippet, 240))}`);
    lines.push(`- stub saw: ${(r.stubRequests ?? []).length ? "" : "(no requests)"}`);
    for (const s of r.stubRequests ?? []) lines.push(`  - ${s}`);
    lines.push("- console (verbatim, preview process stdout/stderr during the probe):");
    lines.push("  ```text");
    if (r.console.length === 0) lines.push("  (nothing)");
    for (const c of r.console) lines.push(`  ${cut(c, 1500)}`);
    lines.push("  ```", "");
  }
  fs.writeFileSync(path.join(OUT, "results.md"), `${lines.join("\n")}\n`);
}

// ---- env files ------------------------------------------------------------------------------------------------------------
function ensureEnvFiles() {
  const content = `SUPABASE_URL=${STUB_URL}\nSUPABASE_KEY=${FAKE_KEY}\n`;
  for (const f of [".env", ".dev.vars"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content);
  }
}

async function withEnvVars(vars, fn) {
  const targets = [path.join(ROOT, ".dev.vars"), path.join(ROOT, "dist", "server", ".dev.vars")];
  const backups = targets.map((t) => (fs.existsSync(t) ? fs.readFileSync(t, "utf8") : null));
  try {
    for (const t of targets) fs.writeFileSync(t, vars);
    await fn();
  } finally {
    targets.forEach((t, i) => {
      if (backups[i] === null) fs.rmSync(t, { force: true });
      else fs.writeFileSync(t, backups[i]);
    });
  }
}

// ---- main -----------------------------------------------------------------------------------------------------------------
async function main() {
  const busy = portsBusy();
  if (busy.length) throw new Error(`ports already in use: ${busy.join(", ")}`);
  ensureEnvFiles();
  const meta = {
    run: RUN,
    node: process.version,
    nodeRequired: fs.readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim(),
    startedAt: new Date().toISOString(),
    base: BASE_URL,
    stub: STUB_URL,
    gitHead: execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim(),
    gitStatus: execSync("git status --short", { cwd: ROOT, encoding: "utf8" }).trim().split("\n"),
    versions: {},
  };
  for (const [name, file] of [
    ["astro", "astro"],
    ["@astrojs/cloudflare", "@astrojs/cloudflare"],
    ["@supabase/supabase-js", "@supabase/supabase-js"],
    ["@supabase/ssr", "@supabase/ssr"],
    ["@supabase/postgrest-js", "@supabase/postgrest-js"],
    ["@supabase/auth-js", "@supabase/auth-js"],
    ["wrangler", "wrangler"],
    ["miniflare", "miniflare"],
    ["workerd", "workerd"],
  ]) {
    meta.versions[name] = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", file, "package.json"), "utf8")).version;
  }

  if (!args["skip-build"]) {
    console.log("building (npm run build) ...");
    const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...SAFE_ENV } });
    fs.writeFileSync(path.join(OUT, "build.log"), `${build.stdout}\n${build.stderr}`);
    if (build.status !== 0) throw new Error(`build failed (exit ${build.status}); see ${path.join(OUT, "build.log")}`);
  }

  await startStub();
  await startPreview("main");
  console.log(`main phase (${MAIN.filter((p) => selected(p.id)).length} probes)`);
  for (const def of MAIN) if (selected(def.id)) await runProbe(def, "main");
  await stopPreview();

  if (!args["no-env"]) {
    for (const c of ENV_CASES) {
      if (wanted && !wanted.some((w) => w.startsWith("P12"))) continue;
      const probes = ENV_PROBES(c.id).filter((p) => !wanted || wanted.some((w) => p.id.startsWith(w)));
      console.log(`env phase: ${c.label}`);
      await withEnvVars(c.vars, async () => {
        await startPreview(`env:${c.id}`);
        for (const def of probes) await runProbe({ ...def, title: `[${c.label}] ${def.title}` }, `env:${c.id}`);
        await stopPreview();
      });
    }
  }

  attachStub();
  meta.finishedAt = new Date().toISOString();
  writeReports(meta);
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
  console.error(`SUITE FAILED: ${error?.stack ?? error}`);
} finally {
  await stopPreview().catch(() => {});
  await stopStub().catch(() => {});
  for (const child of started) await stopGroup(child).catch(() => {});
  await sleep(500);
  // Safety net: anything still running with its cwd inside this worktree was started by this harness.
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    for (const line of leftovers()) {
      try {
        process.kill(Number(line.split(" ")[0]), signal);
      } catch {}
    }
    await sleep(signal === "SIGTERM" ? 1500 : 500);
  }
  const busy = portsBusy();
  const left = leftovers();
  console.log(busy.length ? `WARNING: ports still busy: ${busy.join(", ")}` : `ports ${APP_PORT}/${STUB_PORT} are free`);
  console.log(left.length ? `WARNING: leftover processes:\n${left.join("\n")}` : "no leftover processes from this worktree");
  if (results.length && !failure) console.log(`results: ${path.join(OUT, "results.md")}`);
  previewOut.end();
  process.exit(failure || busy.length || left.length ? 1 : 0);
}
