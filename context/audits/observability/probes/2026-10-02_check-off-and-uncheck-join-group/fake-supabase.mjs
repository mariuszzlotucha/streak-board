#!/usr/bin/env node
// Zero-dependency fake Supabase for the runtime probes: just enough GoTrue and PostgREST for the check-off, join-group and
// dashboard flows. Every request is appended to a JSONL log; behaviour is switched per endpoint over a control API, so one
// build of the app serves every probe.
//
//   node probe/fake-supabase.mjs --port 54399 --out probe/out/<run>/stub-requests.jsonl
//
// Control API (never logged as a stub request):
//   GET  /__health                        -> 200 ok
//   GET  /__mode                          -> current modes and per-endpoint request counters
//   POST /__mode  {reset?, marker?, set?} -> reset: clear modes and drop hanging sockets; marker: label for the following
//                                            log lines (the probe id); set: {<endpoint>: <spec>}
//
// Spec: {mode: "ok"} | {mode: "status", status, body, contentType?, headers?} | {mode: "empty"} | {mode: "reset"}
//       | {mode: "hang"} | {mode: "slow", delayMs, then?: <spec>} ; optional `times: n` limits it to n requests.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ACCESS_TOKEN,
  EMAIL,
  EXPIRED_ACCESS_TOKEN,
  FAKE_KEY,
  FAKE_USER,
  GROUP_NAME,
  IDS,
  JOIN_CODE,
  REFRESH_TOKEN,
  STUB_PORT,
  refreshedSession,
} from "./fixtures.mjs";

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: String(STUB_PORT) },
    out: { type: "string", default: "probe/out/manual/stub-requests.jsonl" },
  },
});
const port = Number(args.port);
fs.mkdirSync(path.dirname(args.out), { recursive: true });

/** @type {Record<string, any>} */
let modes = {};
let marker = "";
const counters = {};
let sinceReset = {}; // per-endpoint request counter since the last control `reset` (drives `after`)
const hanging = new Set();
const sockets = new Set();

const today = () => new Date().toISOString().slice(0, 10);

function classify(method, p, q) {
  if (p === "/auth/v1/user" && method === "GET") return "auth_user";
  if (p === "/auth/v1/logout") return "auth_logout";
  if (p === "/auth/v1/token") return "auth_token";
  if (p === "/rest/v1/groups" && method === "GET") return "groups_get";
  if (p === "/rest/v1/tasks" && method === "GET") {
    if ((q.get("id") ?? "").startsWith("eq.")) return q.get("select") === "id" ? "tasks_exists" : "tasks_get";
    return "tasks_list";
  }
  if (p === "/rest/v1/task_participants") {
    if (method === "GET") return "participants_list";
    return method === "POST" ? "participants_insert" : "participants_delete";
  }
  if (p === "/rest/v1/task_checkoffs") {
    if (method === "POST") return "checkoffs_insert";
    return method === "DELETE" ? "checkoffs_delete" : "checkoffs_other";
  }
  if (p === "/rest/v1/task_checkoff_periods" && method === "GET") return "periods_list";
  if (p === "/rest/v1/rpc/join_group") return "rpc_join_group";
  if (p === "/rest/v1/rpc/preview_group") return "rpc_preview_group";
  if (p === "/rest/v1/rpc/list_group_members") return "rpc_list_group_members";
  return "unhandled";
}

const task = (id) => ({ id, title: "Probe Task", recurrence: "daily", created_by: IDS.user });
const group = { id: IDS.group, name: GROUP_NAME, join_code: JOIN_CODE, owner_id: IDS.user };

/** The happy answer of an endpoint: [status, body, extra headers]. `body` undefined means an empty body. */
function okResponse(ep, req, q, bodyText) {
  switch (ep) {
    case "auth_user": {
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (bearer !== ACCESS_TOKEN) {
        return [401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" }];
      }
      return [200, FAKE_USER];
    }
    case "auth_logout":
      return [204, undefined];
    case "auth_token": {
      // `POST /auth/v1/token?grant_type=refresh_token` with {"refresh_token": "..."}
      let refreshToken = "";
      try {
        refreshToken = JSON.parse(bodyText).refresh_token ?? "";
      } catch {
        // not JSON: treated as an unknown token
      }
      if (refreshToken === REFRESH_TOKEN) return [200, refreshedSession()];
      return [400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }];
    }
    case "groups_get":
      return [200, [group]];
    case "tasks_get":
      return [200, [task((q.get("id") ?? "").replace(/^eq\./, ""))]];
    case "tasks_exists":
      return [200, [{ id: (q.get("id") ?? "").replace(/^eq\./, "") }]];
    case "tasks_list":
      return [200, [task(IDS.task)]];
    case "participants_list":
      return [200, [{ task_id: IDS.task, user_id: IDS.user }]];
    case "participants_insert":
      return [201, undefined];
    case "participants_delete":
      return [200, [{ task_id: IDS.task }]];
    case "periods_list":
      return [200, []];
    case "checkoffs_insert":
      return [201, undefined];
    case "checkoffs_delete":
      return [200, [{ period: today() }]];
    case "rpc_join_group":
      return [200, IDS.group];
    case "rpc_preview_group":
      return [200, GROUP_NAME];
    case "rpc_list_group_members":
      return [200, [{ user_id: IDS.user, email: EMAIL, joined_at: "2026-10-01T10:00:00+00:00", is_owner: true }]];
    default:
      return [
        404,
        {
          code: "PGRST205",
          details: null,
          hint: null,
          message: `probe stub: no handler for ${req.method} ${req.url}`,
        },
      ];
  }
}

function emptyResponse(ep, req, q, bodyText) {
  switch (ep) {
    case "rpc_preview_group":
      return [200, null];
    case "checkoffs_insert":
    case "participants_insert":
      return [201, undefined];
    case "auth_logout":
      return [204, undefined];
    default:
      return [200, []];
  }
}

function logLine(entry) {
  fs.appendFileSync(args.out, `${JSON.stringify(entry)}\n`);
}

function trimHeader(value, keep) {
  if (value === undefined) return undefined;
  return value.length > keep ? `${value.slice(0, keep)}...` : value;
}

/** Which credential a request carried as Bearer: classified, never echoed. */
function bearerKind(header) {
  const token = (header ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return "none";
  if (token === FAKE_KEY) return "anon-key";
  if (token === ACCESS_TOKEN) return "user-jwt";
  if (token === EXPIRED_ACCESS_TOKEN) return "expired-user-jwt";
  return "other";
}

/** What PostgREST answers when the `anon` role touches a table or function the app revoked it from (42501). */
function anonDenied(p) {
  const name = p.split("/").pop();
  const what = p.includes("/rpc/") ? `function ${name}` : `table ${name}`;
  return {
    mode: "status",
    status: 403,
    body: { code: "42501", details: null, hint: null, message: `permission denied for ${what}` },
  };
}

function send(res, status, body, extra = {}, contentType = "application/json; charset=utf-8") {
  // JSON answers are always encoded (a scalar string result such as a group name or uuid becomes a JSON string);
  // other content types (HTML gateway pages, text) are sent as given.
  const isJson = contentType.startsWith("application/json");
  const payload = body === undefined ? "" : isJson ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(payload),
    "X-Probe-Stub": "1",
    ...extra,
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://stub");
    const q = url.searchParams;
    const p = url.pathname;

    // ---- control API ---------------------------------------------------------------------------------------------
    if (p === "/__health") return send(res, 200, "ok", {}, "text/plain");
    if (p === "/__mode") {
      if (req.method === "POST") {
        const cmd = bodyText ? JSON.parse(bodyText) : {};
        if (cmd.reset) {
          modes = {};
          sinceReset = {};
          for (const r of hanging) r.socket?.destroy();
          hanging.clear();
        }
        if (typeof cmd.marker === "string") {
          marker = cmd.marker;
          logLine({ at: new Date().toISOString(), marker, modes: cmd.set ?? {} });
        }
        if (cmd.set) Object.assign(modes, cmd.set);
      }
      return send(res, 200, { modes, counters, marker });
    }

    // ---- stub -----------------------------------------------------------------------------------------------------
    const ep = classify(req.method ?? "GET", p, q);
    counters[ep] = (counters[ep] ?? 0) + 1;
    const nth = (sinceReset[ep] = (sinceReset[ep] ?? 0) + 1);
    const bearer = bearerKind(req.headers.authorization);
    let spec = modes[ep] ?? { mode: "ok" };
    if (spec.times !== undefined) {
      if (spec.times <= 0) spec = { mode: "ok" };
      else modes[ep] = { ...spec, times: spec.times - 1 };
    }
    // `after: n` lets the first n requests of this probe through unharmed (e.g. the middleware's token refresh succeeds,
    // the route's second refresh fails).
    if (spec.after !== undefined && nth <= spec.after) spec = { mode: "ok" };
    // `rest_anon_guard`: PostgREST refuses the anon role (the app revoked it) whenever the request carries the anon key.
    if (modes.rest_anon_guard && p.startsWith("/rest/v1/") && bearer === "anon-key") spec = { ...anonDenied(p), guard: true };
    const entry = {
      at: new Date().toISOString(),
      probe: marker,
      endpoint: ep,
      method: req.method,
      url: req.url,
      mode: spec.guard ? "anon_guard" : spec.mode,
      nth,
      bearer,
      headers: {
        accept: req.headers.accept,
        "content-type": req.headers["content-type"],
        prefer: req.headers.prefer,
        authorization: trimHeader(req.headers.authorization, 16),
        apikey: trimHeader(req.headers.apikey, 12),
        "x-client-info": req.headers["x-client-info"],
        "x-retry-count": req.headers["x-retry-count"],
        "accept-profile": req.headers["accept-profile"],
        "content-profile": req.headers["content-profile"],
      },
      body: bodyText ? trimHeader(bodyText, 600) : undefined,
    };
    const started = Date.now();
    let finished = false;
    const finish = (status) => {
      if (finished) return;
      finished = true;
      logLine({ ...entry, status, ms: Date.now() - started });
    };
    res.on("close", () => finish(res.writableEnded ? res.statusCode : "aborted"));

    const run = (s) => {
      switch (s.mode) {
        case "reset":
          finish("reset");
          if (typeof req.socket.resetAndDestroy === "function") req.socket.resetAndDestroy();
          else req.socket.destroy();
          return;
        case "hang":
          hanging.add(res);
          return; // never answers; the socket is dropped on reset/shutdown or when the client gives up
        case "slow":
          setTimeout(() => run(s.then ?? { mode: "ok" }), s.delayMs ?? 1000);
          return;
        case "status":
          send(res, s.status ?? 500, s.body, s.headers, s.contentType);
          return;
        case "empty": {
          const [status, body] = emptyResponse(ep, req, q, bodyText);
          send(res, status, body);
          return;
        }
        default: {
          const [status, body] = okResponse(ep, req, q, bodyText);
          send(res, status, body);
        }
      }
    };
    run(spec);
  });
});

server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => {});
});

function shutdown() {
  for (const s of sockets) s.destroy();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`fake-supabase listening on 127.0.0.1:${port}, log ${args.out}\n`);
});
