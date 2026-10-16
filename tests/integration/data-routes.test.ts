import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { APIContext, APIRoute } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@/lib/supabase";
import { POST as accountNickname } from "@/pages/api/account/nickname";
import { POST as groupsCreate } from "@/pages/api/groups/create";
import { POST as groupsDelete } from "@/pages/api/groups/delete";
import { POST as groupsJoin } from "@/pages/api/groups/join";
import { POST as groupsLeave } from "@/pages/api/groups/leave";
import { POST as groupsRemoveMember } from "@/pages/api/groups/remove-member";
import { POST as groupsRename } from "@/pages/api/groups/rename";
import { POST as tasksCheckoff } from "@/pages/api/tasks/checkoff";
import { POST as tasksCreate } from "@/pages/api/tasks/create";
import { POST as tasksDelete } from "@/pages/api/tasks/delete";
import { POST as tasksJoin } from "@/pages/api/tasks/join";
import { POST as tasksLeave } from "@/pages/api/tasks/leave";
import { POST as tasksUncheck } from "@/pages/api/tasks/uncheck";
import { POST as tasksUpdate } from "@/pages/api/tasks/update";
import {
  createFakeSupabase,
  type RecordedCall,
  type RecordedStep,
  type ScriptedResult,
  type Supabase,
} from "../helpers/fake-supabase";

// Characterization of the 14 data routes: what each answers, reports and asks the client today, pinned against a
// scripted fake client (tests/helpers/fake-supabase.ts) so a later restructuring keeps the same contract. The two
// per-route suites (groups-join-route, tasks-create-route) stay: they pin the report fields and secret scrubbing in
// more detail. This file deliberately does not import tests/helpers/supabase.ts (database cleanup hooks).

// The route runs without Astro's runtime (no `astro:env`), so the Supabase client is stubbed.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

type RouteId =
  | "account/nickname"
  | "groups/create"
  | "groups/delete"
  | "groups/join"
  | "groups/leave"
  | "groups/remove-member"
  | "groups/rename"
  | "tasks/checkoff"
  | "tasks/create"
  | "tasks/delete"
  | "tasks/join"
  | "tasks/leave"
  | "tasks/uncheck"
  | "tasks/update";

interface RouteEntry {
  POST: APIRoute;
  /** The event prefix of the route's `.failed` and `.exception` lines. */
  event: string;
  /** The form a happy-path submit carries; a row's `form` replaces it. */
  validForm: Record<string, string>;
  /** The page the route sends a rejected submit back to, with `?error=<code>`; "/dashboard" unless given. */
  home?: string;
}

interface Locals {
  user: { id: string } | null;
  /** The nickname the middleware read; the nickname route picks its success target from it. */
  nickname: string | null;
}
type Line = Record<string, unknown>;

interface Expectation {
  /** HTTP status; 302 unless given. */
  status?: number;
  location?: string;
  /** The JSON body (checkoff and uncheck in JSON mode); also asserts `Cache-Control: no-store`. */
  json?: unknown;
  /** "none": the route answered before creating a client. Otherwise it was created once with the request's headers and cookies. */
  client?: "none" | "created";
  /** The `console.error` lines, matched in order; none unless given. */
  errors?: Line[];
  /** The `console.info` lines, matched in order; none unless given. */
  infos?: Line[];
  /** "cleared": the join cookie was deleted once with its path. Otherwise no cookie was set or deleted. */
  cookie?: "cleared" | "kept";
  /** The exact recorded call chain. */
  calls?: RecordedCall[];
}

interface Row {
  name: string;
  route: RouteId;
  form?: Record<string, string>;
  /** A non-form body (sent as application/json), so `formData()` throws. */
  body?: string;
  headers?: Record<string, string>;
  script?: ScriptedResult[];
  locals?: Locals;
  /** "null": Supabase is not configured. "throwing": every client call throws. */
  client?: "null" | "throwing";
  expect: Expectation;
}

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const CODE = "a1b2c3d4e5f6";
const GROUP = { id: "g-1", name: "Runners", join_code: CODE, owner_id: USER };
const ANON: Locals = { user: null, nickname: null };
const JSON_HEADERS = { Accept: "application/json" };

// 23:30 UTC on 2026-10-07 is already 2026-10-08 in Warsaw (CEST) and still 2026-10-07 in Los Angeles, the test zone
// (vitest.config.ts): a key computed from local getters would differ. 2026-10-08 is a Thursday; its week starts on
// Monday 2026-10-05 and ends on 2026-10-11.
const NOW = new Date("2026-10-07T23:30:00Z");
const DAILY_PERIOD = "2026-10-08";
const WEEKLY_PERIOD = "2026-10-05";
const WEEK_END = "2026-10-11";

const ROUTES: Record<RouteId, RouteEntry> = {
  "account/nickname": {
    POST: accountNickname,
    event: "account.nickname",
    validForm: { nickname: "Kasia" },
    home: "/account/nickname",
  },
  "groups/create": { POST: groupsCreate, event: "groups.create", validForm: { name: "  Runners  " } },
  "groups/delete": { POST: groupsDelete, event: "groups.delete", validForm: {} },
  "groups/join": { POST: groupsJoin, event: "groups.join", validForm: { code: CODE } },
  "groups/leave": { POST: groupsLeave, event: "groups.leave", validForm: {} },
  "groups/remove-member": { POST: groupsRemoveMember, event: "groups.remove_member", validForm: { user_id: OTHER } },
  "groups/rename": { POST: groupsRename, event: "groups.rename", validForm: { name: "  Runners  " } },
  "tasks/checkoff": { POST: tasksCheckoff, event: "checkoff", validForm: { task_id: TASK } },
  "tasks/create": { POST: tasksCreate, event: "tasks.create", validForm: { title: "  Run  ", recurrence: "daily" } },
  "tasks/delete": { POST: tasksDelete, event: "tasks.delete", validForm: { task_id: TASK } },
  "tasks/join": { POST: tasksJoin, event: "tasks.join", validForm: { task_id: TASK } },
  "tasks/leave": { POST: tasksLeave, event: "tasks.leave", validForm: { task_id: TASK } },
  "tasks/uncheck": { POST: tasksUncheck, event: "uncheck", validForm: { task_id: TASK } },
  "tasks/update": { POST: tasksUpdate, event: "tasks.update", validForm: { task_id: TASK, title: "  Run  " } },
};
const ROUTE_IDS = Object.keys(ROUTES) as RouteId[];

// Scripted results.
const ok = (data: unknown = null, status = 200): ScriptedResult => ({ data, error: null, status });
const err = (code: string, status: number): ScriptedResult => ({
  data: null,
  error: { code, message: `sqlstate ${code}` },
  status,
});
const RLS = err("42501", 403);
const UNMAPPED = err("XX000", 500);
const task = (recurrence: string) => ({ id: TASK, title: "Run", recurrence, created_by: USER });

// Recorded call chains.
const step = (method: string, ...args: unknown[]): RecordedStep => ({ method, args });
const from = (name: string, ...chain: RecordedStep[]): RecordedCall => ({ kind: "from", name, chain });
const rpc = (name: string, params: unknown): RecordedCall => ({ kind: "rpc", name, chain: [step("rpc", params)] });
const MY_GROUP = from("groups", step("select", "id, name, join_code, owner_id"), step("maybeSingle"));
const GET_TASK = from(
  "tasks",
  step("select", "id, title, recurrence, created_by"),
  step("eq", "id", TASK),
  step("maybeSingle"),
);
const TASK_EXISTS = from("tasks", step("select", "id"), step("eq", "id", TASK), step("maybeSingle"));

// Report lines.
const request = (route: RouteId): Line => ({ route: `/api/${route}`, userId: USER, ray: "ray-1" });
const failed = (route: RouteId, outcome: "forbidden" | "unknown", code: string, status: number): Line => ({
  level: "error",
  event: `${ROUTES[route].event}.failed`,
  ...request(route),
  status,
  outcome,
  error: { code },
});
const exception = (route: RouteId): Line => ({
  level: "error",
  event: `${ROUTES[route].event}.exception`,
  ...request(route),
});
const info = (route: RouteId, suffix: string, extra: Line = {}): Line => ({
  level: "info",
  event: `${ROUTES[route].event}.${suffix}`,
  ...request(route),
  ...extra,
});

const DASHBOARD = "/dashboard";
const FORBIDDEN = "/dashboard?error=forbidden";
const UNKNOWN = "/dashboard?error=unknown";

/** Where the route sends a rejected submit with this error code. */
const errorTarget = (route: RouteId, code: string): string => `${ROUTES[route].home ?? DASHBOARD}?error=${code}`;

// Rows every route shares, with the route's own valid form.
function common(route: RouteId): Row[] {
  return [
    {
      name: "anonymous: redirects to sign-in before any client or report",
      route,
      locals: ANON,
      expect: { location: "/auth/signin", client: "none" },
    },
    {
      name: "no client: not_configured after validation",
      route,
      client: "null",
      expect: { location: errorTarget(route, "not_configured") },
    },
  ];
}

// A redirect route's mutation outcomes: the 42501 and unmapped reports and, when given, the quiet domain codes,
// each with the words that name its case in the row title.
function mutationFailures(route: RouteId, preRead: ScriptedResult[], quiet: [string, string, string][]): Row[] {
  return [
    {
      name: "permission error: forbidden, with an error line carrying the status",
      route,
      script: [...preRead, RLS],
      expect: { location: errorTarget(route, "forbidden"), errors: [failed(route, "forbidden", "42501", 403)] },
    },
    ...quiet.map(([code, outcome, label]): Row => ({
      name: `${label}: ${outcome}, quiet`,
      route,
      script: [...preRead, err(code, 400)],
      expect: { location: errorTarget(route, outcome) },
    })),
    {
      name: "unexpected error: unknown, with an error line carrying the status",
      route,
      script: [...preRead, UNMAPPED],
      expect: { location: errorTarget(route, "unknown"), errors: [failed(route, "unknown", "XX000", 500)] },
    },
  ];
}

const nonFormBody = (route: RouteId): Row => ({
  name: "non-form body: unknown with the exception line, no client",
  route,
  body: "not a form",
  expect: { location: errorTarget(route, "unknown"), client: "none", errors: [exception(route)] },
});

const throwingClient = (route: RouteId): Row => ({
  name: "a thrown client error: unknown with the exception line",
  route,
  client: "throwing",
  expect: {
    location: errorTarget(route, "unknown"),
    errors: [{ ...exception(route), error: { name: "Error", message: "network down" } }],
  },
});

const ROWS: Row[] = [
  // account/nickname
  ...common("account/nickname"),
  {
    name: "empty nickname: invalid_nickname before any client",
    route: "account/nickname",
    form: { nickname: "" },
    expect: { location: "/account/nickname?error=invalid_nickname", client: "none" },
  },
  {
    name: "missing nickname field: invalid_nickname",
    route: "account/nickname",
    form: {},
    expect: { location: "/account/nickname?error=invalid_nickname", client: "none" },
  },
  {
    name: "25-character nickname: invalid_nickname",
    route: "account/nickname",
    form: { nickname: "a".repeat(25) },
    expect: { location: "/account/nickname?error=invalid_nickname", client: "none" },
  },
  {
    name: "rpc ok on the first choice: dashboard, the trimmed nickname in the call",
    route: "account/nickname",
    form: { nickname: "  Kasia \t" },
    script: [ok(null, 204)],
    expect: { location: DASHBOARD, calls: [rpc("set_nickname", { p_nickname: "Kasia" })] },
  },
  {
    name: "rpc ok on a change: back to settings",
    route: "account/nickname",
    locals: { user: { id: USER }, nickname: "Old" },
    script: [ok(null, 204)],
    expect: { location: "/settings", calls: [rpc("set_nickname", { p_nickname: "Kasia" })] },
  },
  ...mutationFailures(
    "account/nickname",
    [],
    [
      ["23505", "nickname_taken", "another account has the nickname"],
      ["23514", "invalid_nickname", "the nickname fails its check constraint"],
    ],
  ),
  nonFormBody("account/nickname"),

  // groups/create
  ...common("groups/create"),
  {
    name: "whitespace-only name: invalid_name before any client",
    route: "groups/create",
    form: { name: " \t\r\n" },
    expect: { location: "/dashboard?error=invalid_name", client: "none" },
  },
  {
    name: "missing name field: invalid_name",
    route: "groups/create",
    form: {},
    expect: { location: "/dashboard?error=invalid_name", client: "none" },
  },
  {
    name: "81-character name: invalid_name",
    route: "groups/create",
    form: { name: "a".repeat(81) },
    expect: { location: "/dashboard?error=invalid_name", client: "none" },
  },
  {
    name: "insert ok: dashboard, join cookie cleared, the trimmed name and the owner in the insert",
    route: "groups/create",
    script: [ok(null, 201)],
    expect: {
      location: DASHBOARD,
      cookie: "cleared",
      calls: [from("groups", step("insert", { name: "Runners", owner_id: USER }))],
    },
  },
  ...mutationFailures(
    "groups/create",
    [],
    [
      ["23514", "invalid_name", "the name fails its check constraint"],
      ["23505", "already_in_group", "the user already has a group"],
    ],
  ),
  nonFormBody("groups/create"),

  // groups/join
  ...common("groups/join"),
  {
    name: "invalid code: invalid_code before any client, join cookie cleared",
    route: "groups/join",
    form: { code: "not hex!" },
    expect: { location: "/dashboard?error=invalid_code", client: "none", cookie: "cleared" },
  },
  {
    name: "rpc ok with a pasted uppercase invite link: dashboard, cookie cleared, the lowercase code in the call",
    route: "groups/join",
    form: { code: `https://streak.example/join/${CODE.toUpperCase()}/?utm=x` },
    script: [ok(GROUP.id)],
    expect: { location: DASHBOARD, cookie: "cleared", calls: [rpc("join_group", { p_join_code: CODE })] },
  },
  {
    name: "no group matches the code: invalid_code, quiet, the spent invite cleared",
    route: "groups/join",
    script: [err("P0002", 400)],
    expect: { location: "/dashboard?error=invalid_code", cookie: "cleared" },
  },
  {
    name: "the user already has a group: already_in_group, quiet, the spent invite cleared",
    route: "groups/join",
    script: [err("23505", 409)],
    expect: { location: "/dashboard?error=already_in_group", cookie: "cleared" },
  },
  {
    name: "permission error: forbidden, with an error line carrying the status and the code length, invite kept",
    route: "groups/join",
    script: [RLS],
    expect: { location: FORBIDDEN, errors: [{ ...failed("groups/join", "forbidden", "42501", 403), codeLength: 12 }] },
  },
  {
    name: "unexpected error: unknown, with an error line, invite kept for a retry",
    route: "groups/join",
    script: [UNMAPPED],
    expect: { location: UNKNOWN, errors: [{ ...failed("groups/join", "unknown", "XX000", 500), codeLength: 12 }] },
  },
  nonFormBody("groups/join"),

  // groups/rename
  ...common("groups/rename"),
  {
    name: "empty name: invalid_name before any client",
    route: "groups/rename",
    form: { name: "" },
    expect: { location: "/dashboard?error=invalid_name", client: "none" },
  },
  {
    name: "no group: forbidden, quiet",
    route: "groups/rename",
    script: [ok(null)],
    expect: { location: FORBIDDEN, calls: [MY_GROUP] },
  },
  {
    name: "group read fails: the helper throws, unknown with the exception line",
    route: "groups/rename",
    script: [UNMAPPED],
    expect: { location: UNKNOWN, errors: [{ ...exception("groups/rename"), error: { code: "XX000" } }] },
  },
  {
    name: "update ok: dashboard, the trimmed name on the caller's group only",
    route: "groups/rename",
    script: [ok(GROUP), ok([{ id: GROUP.id }])],
    expect: {
      location: DASHBOARD,
      calls: [
        MY_GROUP,
        from("groups", step("update", { name: "Runners" }), step("eq", "id", GROUP.id), step("select", "id")),
      ],
    },
  },
  {
    name: "update touches no row (not the owner): forbidden, quiet",
    route: "groups/rename",
    script: [ok(GROUP), ok([])],
    expect: { location: FORBIDDEN },
  },
  ...mutationFailures("groups/rename", [ok(GROUP)], [["23514", "invalid_name", "the name fails its check constraint"]]),
  nonFormBody("groups/rename"),

  // groups/leave
  ...common("groups/leave"),
  {
    name: "delete ok: dashboard, only the caller's own membership row",
    route: "groups/leave",
    script: [ok([{ id: "m-1" }])],
    expect: {
      location: DASHBOARD,
      calls: [from("group_members", step("delete"), step("eq", "user_id", USER), step("select", "id"))],
    },
  },
  {
    name: "nothing deleted while still in a group (the owner): forbidden, quiet",
    route: "groups/leave",
    script: [ok([]), ok(GROUP)],
    expect: {
      location: FORBIDDEN,
      calls: [from("group_members", step("delete"), step("eq", "user_id", USER), step("select", "id")), MY_GROUP],
    },
  },
  {
    name: "nothing deleted and no group (already left): dashboard, quiet",
    route: "groups/leave",
    script: [ok([]), ok(null)],
    expect: { location: DASHBOARD },
  },
  {
    name: "nothing deleted and the group read fails: unknown with the exception line",
    route: "groups/leave",
    script: [ok([]), UNMAPPED],
    expect: { location: UNKNOWN, errors: [{ ...exception("groups/leave"), error: { code: "XX000" } }] },
  },
  ...mutationFailures("groups/leave", [], []),
  throwingClient("groups/leave"),

  // groups/delete
  ...common("groups/delete"),
  {
    name: "no group (already deleted): dashboard, quiet",
    route: "groups/delete",
    script: [ok(null)],
    expect: { location: DASHBOARD, calls: [MY_GROUP] },
  },
  {
    name: "delete ok: dashboard, the caller's group by id",
    route: "groups/delete",
    script: [ok(GROUP), ok([{ id: GROUP.id }])],
    expect: {
      location: DASHBOARD,
      calls: [MY_GROUP, from("groups", step("delete"), step("eq", "id", GROUP.id), step("select", "id"))],
    },
  },
  {
    name: "delete touches no row (not the owner): forbidden, quiet",
    route: "groups/delete",
    script: [ok(GROUP), ok([])],
    expect: { location: FORBIDDEN },
  },
  ...mutationFailures("groups/delete", [ok(GROUP)], []),
  throwingClient("groups/delete"),

  // groups/remove-member
  ...common("groups/remove-member"),
  {
    name: "malformed user_id: forbidden before any client",
    route: "groups/remove-member",
    form: { user_id: "not-a-uuid" },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "the caller's own id (any spelling): forbidden before any client",
    route: "groups/remove-member",
    form: { user_id: USER.toUpperCase() },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "no group (deleted meanwhile): dashboard, quiet",
    route: "groups/remove-member",
    script: [ok(null)],
    expect: { location: DASHBOARD, calls: [MY_GROUP] },
  },
  {
    name: "delete ok: dashboard, the lowercased target in the caller's group, never the caller's own row",
    route: "groups/remove-member",
    form: { user_id: OTHER.toUpperCase() },
    script: [ok(GROUP), ok([{ id: "m-2" }])],
    expect: {
      location: DASHBOARD,
      calls: [
        MY_GROUP,
        from(
          "group_members",
          step("delete"),
          step("eq", "group_id", GROUP.id),
          step("eq", "user_id", OTHER),
          step("neq", "user_id", USER),
          step("select", "id"),
        ),
      ],
    },
  },
  {
    name: "nothing deleted as the owner (target already gone): dashboard, quiet",
    route: "groups/remove-member",
    script: [ok(GROUP), ok([])],
    expect: { location: DASHBOARD },
  },
  {
    name: "nothing deleted as a member: forbidden, quiet",
    route: "groups/remove-member",
    script: [ok({ ...GROUP, owner_id: STRANGER }), ok([])],
    expect: { location: FORBIDDEN },
  },
  ...mutationFailures("groups/remove-member", [ok(GROUP)], []),
  nonFormBody("groups/remove-member"),

  // tasks/create
  ...common("tasks/create"),
  {
    name: "empty title: invalid_title before any client",
    route: "tasks/create",
    form: { title: "", recurrence: "daily" },
    expect: { location: "/dashboard?error=invalid_title", client: "none" },
  },
  {
    name: "unknown recurrence: invalid_recurrence before any client",
    route: "tasks/create",
    form: { title: "Run", recurrence: "monthly" },
    expect: { location: "/dashboard?error=invalid_recurrence", client: "none" },
  },
  {
    name: "both invalid: the title is checked first",
    route: "tasks/create",
    form: { title: "", recurrence: "monthly" },
    expect: { location: "/dashboard?error=invalid_title", client: "none" },
  },
  {
    name: "no group: forbidden, quiet",
    route: "tasks/create",
    script: [ok(null)],
    expect: { location: FORBIDDEN, calls: [MY_GROUP] },
  },
  {
    name: "insert ok: dashboard, the trimmed title in the caller's group with the caller as creator",
    route: "tasks/create",
    script: [ok(GROUP), ok(null, 201)],
    expect: {
      location: DASHBOARD,
      calls: [
        MY_GROUP,
        from("tasks", step("insert", { group_id: GROUP.id, created_by: USER, title: "Run", recurrence: "daily" })),
      ],
    },
  },
  ...mutationFailures(
    "tasks/create",
    [ok(GROUP)],
    [["23514", "invalid_title", "the title fails its check constraint"]],
  ),
  nonFormBody("tasks/create"),

  // tasks/update
  ...common("tasks/update"),
  {
    name: "malformed task_id: forbidden before any client",
    route: "tasks/update",
    form: { task_id: "not-a-uuid", title: "Run" },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "empty title: invalid_title before any client",
    route: "tasks/update",
    form: { task_id: TASK, title: " " },
    expect: { location: "/dashboard?error=invalid_title", client: "none" },
  },
  {
    name: "both invalid: the id is checked first",
    route: "tasks/update",
    form: { task_id: "not-a-uuid", title: "" },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "task not visible: dashboard, quiet",
    route: "tasks/update",
    script: [ok(null)],
    expect: { location: DASHBOARD, calls: [GET_TASK] },
  },
  {
    name: "task read fails: the helper throws, unknown with the exception line",
    route: "tasks/update",
    script: [UNMAPPED],
    expect: { location: UNKNOWN, errors: [{ ...exception("tasks/update"), error: { code: "XX000" } }] },
  },
  {
    name: "update ok with an uppercase id: dashboard, the trimmed title on the lowercased id",
    route: "tasks/update",
    form: { task_id: TASK.toUpperCase(), title: "  Run  " },
    script: [ok(task("daily")), ok([{ id: TASK }])],
    expect: {
      location: DASHBOARD,
      calls: [GET_TASK, from("tasks", step("update", { title: "Run" }), step("eq", "id", TASK), step("select", "id"))],
    },
  },
  {
    name: "update touches no row (not the creator): forbidden, quiet",
    route: "tasks/update",
    script: [ok(task("daily")), ok([])],
    expect: { location: FORBIDDEN },
  },
  ...mutationFailures(
    "tasks/update",
    [ok(task("daily"))],
    [["23514", "invalid_title", "the title fails its check constraint"]],
  ),
  nonFormBody("tasks/update"),

  // tasks/delete
  ...common("tasks/delete"),
  {
    name: "malformed task_id: forbidden before any client",
    route: "tasks/delete",
    form: { task_id: "not-a-uuid" },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "task not visible: dashboard, quiet",
    route: "tasks/delete",
    script: [ok(null)],
    expect: { location: DASHBOARD, calls: [GET_TASK] },
  },
  {
    name: "delete ok: dashboard, the task by id",
    route: "tasks/delete",
    script: [ok(task("daily")), ok([{ id: TASK }])],
    expect: {
      location: DASHBOARD,
      calls: [GET_TASK, from("tasks", step("delete"), step("eq", "id", TASK), step("select", "id"))],
    },
  },
  {
    name: "delete touches no row (not the creator): forbidden, quiet",
    route: "tasks/delete",
    script: [ok(task("daily")), ok([])],
    expect: { location: FORBIDDEN },
  },
  ...mutationFailures("tasks/delete", [ok(task("daily"))], []),
  nonFormBody("tasks/delete"),

  // tasks/join
  ...common("tasks/join"),
  {
    name: "malformed task_id: forbidden before any client",
    route: "tasks/join",
    form: { task_id: "not-a-uuid" },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "task not visible: dashboard, quiet",
    route: "tasks/join",
    script: [ok(null)],
    expect: { location: DASHBOARD, calls: [TASK_EXISTS] },
  },
  {
    name: "insert ok: dashboard, the caller enrolled on the task",
    route: "tasks/join",
    script: [ok({ id: TASK }), ok(null, 201)],
    expect: {
      location: DASHBOARD,
      calls: [TASK_EXISTS, from("task_participants", step("insert", { task_id: TASK, user_id: USER }))],
    },
  },
  {
    name: "the user already joined the task: dashboard, quiet",
    route: "tasks/join",
    script: [ok({ id: TASK }), err("23505", 409)],
    expect: { location: DASHBOARD },
  },
  {
    name: "the task was deleted meanwhile: dashboard, quiet",
    route: "tasks/join",
    script: [ok({ id: TASK }), err("23503", 409)],
    expect: { location: DASHBOARD },
  },
  ...mutationFailures("tasks/join", [ok({ id: TASK })], []),
  nonFormBody("tasks/join"),

  // tasks/leave
  ...common("tasks/leave"),
  {
    name: "malformed task_id: forbidden before any client",
    route: "tasks/leave",
    form: { task_id: "not-a-uuid" },
    expect: { location: FORBIDDEN, client: "none" },
  },
  {
    name: "delete ok: dashboard, only the caller's own enrolment",
    route: "tasks/leave",
    script: [ok([{ task_id: TASK }])],
    expect: {
      location: DASHBOARD,
      calls: [
        from(
          "task_participants",
          step("delete"),
          step("eq", "task_id", TASK),
          step("eq", "user_id", USER),
          step("select", "task_id"),
        ),
      ],
    },
  },
  {
    name: "nothing deleted (not joined or task gone): dashboard, quiet",
    route: "tasks/leave",
    script: [ok([])],
    expect: { location: DASHBOARD },
  },
  ...mutationFailures("tasks/leave", [], []),
  nonFormBody("tasks/leave"),

  // tasks/checkoff
  ...common("tasks/checkoff"),
  {
    name: "anonymous JSON fetch: still a redirect to sign-in",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    locals: ANON,
    expect: { location: "/auth/signin", client: "none" },
  },
  {
    name: "malformed task_id: the invalid redirect with an info line, no client",
    route: "tasks/checkoff",
    form: { task_id: "not-a-uuid" },
    expect: { location: FORBIDDEN, client: "none", infos: [info("tasks/checkoff", "invalid_id")] },
  },
  {
    name: "malformed task_id, JSON: 400 invalid with an info line",
    route: "tasks/checkoff",
    form: { task_id: "not-a-uuid" },
    headers: JSON_HEADERS,
    expect: {
      status: 400,
      json: { ok: false, error: "invalid" },
      client: "none",
      infos: [info("tasks/checkoff", "invalid_id")],
    },
  },
  {
    name: "no client, JSON: 503 not_configured",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    client: "null",
    expect: { status: 503, json: { ok: false, error: "not_configured" } },
  },
  {
    name: "task not visible: dashboard with a task_gone info line",
    route: "tasks/checkoff",
    script: [ok(null)],
    expect: { location: DASHBOARD, infos: [info("tasks/checkoff", "task_gone", { taskId: TASK })], calls: [GET_TASK] },
  },
  {
    name: "task not visible, JSON: 404 gone with a task_gone info line",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    script: [ok(null)],
    expect: {
      status: 404,
      json: { ok: false, error: "gone" },
      infos: [info("tasks/checkoff", "task_gone", { taskId: TASK })],
    },
  },
  {
    name: "daily tick ok: dashboard, the Warsaw day as the period",
    route: "tasks/checkoff",
    script: [ok(task("daily")), ok(null, 201)],
    expect: {
      location: DASHBOARD,
      calls: [GET_TASK, from("task_checkoffs", step("insert", { task_id: TASK, user_id: USER, period: DAILY_PERIOD }))],
    },
  },
  {
    name: "daily tick ok, JSON: 200 with the Warsaw day",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    script: [ok(task("daily")), ok(null, 201)],
    expect: { status: 200, json: { ok: true, period: DAILY_PERIOD } },
  },
  {
    name: "weekly tick ok, JSON: 200 with the Monday key",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    script: [ok(task("weekly")), ok(null, 201)],
    expect: {
      status: 200,
      json: { ok: true, period: WEEKLY_PERIOD },
      calls: [
        GET_TASK,
        from("task_checkoffs", step("insert", { task_id: TASK, user_id: USER, period: WEEKLY_PERIOD })),
      ],
    },
  },
  {
    name: "once tick ok, JSON: 200 with the day",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    script: [ok(task("once")), ok(null, 201)],
    expect: { status: 200, json: { ok: true, period: DAILY_PERIOD } },
  },
  {
    name: "the period is already ticked: dashboard, quiet",
    route: "tasks/checkoff",
    script: [ok(task("daily")), err("23505", 409)],
    expect: { location: DASHBOARD },
  },
  {
    name: "permission error: forbidden, with the data layer's error line (ids and status, no route)",
    route: "tasks/checkoff",
    script: [ok(task("daily")), RLS],
    expect: {
      location: FORBIDDEN,
      errors: [
        {
          level: "error",
          event: "checkoff.forbidden",
          userId: USER,
          taskId: TASK,
          status: 403,
          error: { code: "42501" },
        },
      ],
    },
  },
  {
    name: "permission error, JSON: 403 forbidden",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    script: [ok(task("daily")), RLS],
    expect: { status: 403, json: { ok: false, error: "forbidden" }, errors: [{ event: "checkoff.forbidden" }] },
  },
  {
    name: "the user is not enrolled in the task: forbidden, with an info line",
    route: "tasks/checkoff",
    script: [ok(task("daily")), err("23503", 409)],
    expect: {
      location: FORBIDDEN,
      infos: [{ level: "info", event: "checkoff.not_enrolled", userId: USER, taskId: TASK }],
    },
  },
  {
    name: "unexpected error: unknown, with the route's failed line carrying the task id",
    route: "tasks/checkoff",
    script: [ok(task("daily")), UNMAPPED],
    expect: {
      location: UNKNOWN,
      errors: [
        {
          level: "error",
          event: "checkoff.failed",
          ...request("tasks/checkoff"),
          taskId: TASK,
          error: { code: "XX000" },
        },
      ],
    },
  },
  {
    name: "unexpected error, JSON: 500 unknown",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    script: [ok(task("daily")), UNMAPPED],
    expect: { status: 500, json: { ok: false, error: "unknown" }, errors: [{ event: "checkoff.failed" }] },
  },
  {
    name: "task with an unknown recurrence: the helper throws, unknown with the exception line",
    route: "tasks/checkoff",
    script: [ok(task("monthly"))],
    expect: { location: UNKNOWN, errors: [exception("tasks/checkoff")] },
  },
  nonFormBody("tasks/checkoff"),
  {
    name: "non-form body, JSON: 500 unknown with the exception line, no client",
    route: "tasks/checkoff",
    headers: JSON_HEADERS,
    body: "not a form",
    expect: {
      status: 500,
      json: { ok: false, error: "unknown" },
      client: "none",
      errors: [exception("tasks/checkoff")],
    },
  },

  // tasks/uncheck
  ...common("tasks/uncheck"),
  {
    name: "malformed task_id: the invalid redirect with an info line, no client",
    route: "tasks/uncheck",
    form: { task_id: "not-a-uuid" },
    expect: { location: FORBIDDEN, client: "none", infos: [info("tasks/uncheck", "invalid_id")] },
  },
  {
    name: "malformed task_id, JSON: 400 invalid with an info line",
    route: "tasks/uncheck",
    form: { task_id: "not-a-uuid" },
    headers: JSON_HEADERS,
    expect: {
      status: 400,
      json: { ok: false, error: "invalid" },
      client: "none",
      infos: [info("tasks/uncheck", "invalid_id")],
    },
  },
  {
    name: "no client, JSON: 503 not_configured",
    route: "tasks/uncheck",
    headers: JSON_HEADERS,
    client: "null",
    expect: { status: 503, json: { ok: false, error: "not_configured" } },
  },
  {
    name: "task not visible: dashboard with a task_gone info line",
    route: "tasks/uncheck",
    script: [ok(null)],
    expect: { location: DASHBOARD, infos: [info("tasks/uncheck", "task_gone", { taskId: TASK })], calls: [GET_TASK] },
  },
  {
    name: "task not visible, JSON: 404 gone",
    route: "tasks/uncheck",
    headers: JSON_HEADERS,
    script: [ok(null)],
    expect: {
      status: 404,
      json: { ok: false, error: "gone" },
      infos: [info("tasks/uncheck", "task_gone", { taskId: TASK })],
    },
  },
  {
    name: "daily undo ok: dashboard, the caller's row for the Warsaw day",
    route: "tasks/uncheck",
    script: [ok(task("daily")), ok([{ period: DAILY_PERIOD }])],
    expect: {
      location: DASHBOARD,
      calls: [
        GET_TASK,
        from(
          "task_checkoffs",
          step("delete"),
          step("eq", "task_id", TASK),
          step("eq", "user_id", USER),
          step("eq", "period", DAILY_PERIOD),
          step("select", "period"),
        ),
      ],
    },
  },
  {
    name: "weekly undo ok, JSON: 200 with the Monday key, the whole week deleted",
    route: "tasks/uncheck",
    headers: JSON_HEADERS,
    script: [ok(task("weekly")), ok([{ period: WEEKLY_PERIOD }])],
    expect: {
      status: 200,
      json: { ok: true, period: WEEKLY_PERIOD },
      calls: [
        GET_TASK,
        from(
          "task_checkoffs",
          step("delete"),
          step("eq", "task_id", TASK),
          step("eq", "user_id", USER),
          step("gte", "period", WEEKLY_PERIOD),
          step("lte", "period", WEEK_END),
          step("select", "period"),
        ),
      ],
    },
  },
  {
    name: "once undo ok, JSON: 200 with the day, every row deleted",
    route: "tasks/uncheck",
    headers: JSON_HEADERS,
    script: [ok(task("once")), ok([{ period: "2026-09-01" }])],
    expect: {
      status: 200,
      json: { ok: true, period: DAILY_PERIOD },
      calls: [
        GET_TASK,
        from(
          "task_checkoffs",
          step("delete"),
          step("eq", "task_id", TASK),
          step("eq", "user_id", USER),
          step("select", "period"),
        ),
      ],
    },
  },
  {
    name: "nothing removed: dashboard with a nothing_removed info line",
    route: "tasks/uncheck",
    script: [ok(task("daily")), ok([])],
    expect: {
      location: DASHBOARD,
      infos: [{ level: "info", event: "uncheck.nothing_removed", userId: USER, taskId: TASK }],
    },
  },
  {
    name: "permission error: forbidden, with the data layer's error line",
    route: "tasks/uncheck",
    script: [ok(task("daily")), RLS],
    expect: {
      location: FORBIDDEN,
      errors: [
        {
          level: "error",
          event: "uncheck.forbidden",
          userId: USER,
          taskId: TASK,
          status: 403,
          error: { code: "42501" },
        },
      ],
    },
  },
  {
    name: "permission error, JSON: 403 forbidden",
    route: "tasks/uncheck",
    headers: JSON_HEADERS,
    script: [ok(task("daily")), RLS],
    expect: { status: 403, json: { ok: false, error: "forbidden" }, errors: [{ event: "uncheck.forbidden" }] },
  },
  {
    name: "the user is not enrolled in the task: forbidden, with an info line",
    route: "tasks/uncheck",
    script: [ok(task("daily")), err("23503", 409)],
    expect: {
      location: FORBIDDEN,
      infos: [{ level: "info", event: "uncheck.not_enrolled", userId: USER, taskId: TASK }],
    },
  },
  {
    name: "unexpected error: unknown, with the route's failed line carrying the task id",
    route: "tasks/uncheck",
    script: [ok(task("daily")), UNMAPPED],
    expect: {
      location: UNKNOWN,
      errors: [
        {
          level: "error",
          event: "uncheck.failed",
          ...request("tasks/uncheck"),
          taskId: TASK,
          error: { code: "XX000" },
        },
      ],
    },
  },
  {
    name: "unexpected error, JSON: 500 unknown",
    route: "tasks/uncheck",
    headers: JSON_HEADERS,
    script: [ok(task("daily")), UNMAPPED],
    expect: { status: 500, json: { ok: false, error: "unknown" }, errors: [{ event: "uncheck.failed" }] },
  },
  nonFormBody("tasks/uncheck"),
];

const THROWING = {
  from() {
    throw new Error("network down");
  },
  rpc() {
    throw new Error("network down");
  },
} as unknown as Supabase;

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function run(row: Row): Promise<void> {
  const { POST, validForm } = ROUTES[row.route];
  const pattern = `/api/${row.route}`;
  const fake = createFakeSupabase(row.script ?? []);
  const client = row.client === "null" ? null : row.client === "throwing" ? THROWING : fake.client;
  vi.mocked(createClient).mockReturnValue(client);

  const headers: Record<string, string> = { "cf-ray": "ray-1", ...row.headers };
  if (row.body !== undefined) headers["Content-Type"] = "application/json";
  const body = row.body ?? new URLSearchParams(row.form ?? validForm);
  const request = new Request(`http://localhost:4321${pattern}`, { method: "POST", body, headers });
  const cookies = { delete: vi.fn(), set: vi.fn(), get: vi.fn() };
  const redirect = vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } }));
  const context = {
    request,
    routePattern: pattern,
    locals: row.locals ?? { user: { id: USER }, nickname: null },
    cookies,
    redirect,
  } as unknown as APIContext;

  const response = await POST(context);

  const expected = row.expect;
  expect(response.status).toBe(expected.status ?? 302);
  if (expected.location !== undefined) {
    expect(response.headers.get("Location")).toBe(expected.location);
  } else {
    expect(redirect).not.toHaveBeenCalled();
  }
  if (expected.json !== undefined) {
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await (response.json() as Promise<unknown>)).toEqual(expected.json);
  }

  if (expected.client === "none") {
    expect(createClient).not.toHaveBeenCalled();
  } else {
    expect(createClient).toHaveBeenCalledExactlyOnceWith(request.headers, cookies);
  }

  const errors = expected.errors ?? [];
  const errorLines = errorSpy.mock.calls.map((call: unknown[]): unknown => call[0]);
  expect(errorLines).toHaveLength(errors.length);
  errors.forEach((line, index) => {
    expect(errorLines[index]).toMatchObject(line);
  });
  const infos = expected.infos ?? [];
  const infoLines = infoSpy.mock.calls.map((call: unknown[]): unknown => call[0]);
  expect(infoLines).toHaveLength(infos.length);
  infos.forEach((line, index) => {
    expect(infoLines[index]).toMatchObject(line);
  });

  if (expected.cookie === "cleared") {
    expect(cookies.delete).toHaveBeenCalledExactlyOnceWith("join_code", { path: "/" });
  } else {
    expect(cookies.delete).not.toHaveBeenCalled();
  }
  expect(cookies.set).not.toHaveBeenCalled();

  if (expected.calls) expect(fake.calls).toEqual(expected.calls);
  expect(fake.remaining(), "every scripted result is consumed").toBe(0);
}

for (const route of ROUTE_IDS) {
  describe(`POST /api/${route}`, () => {
    for (const row of ROWS.filter((candidate) => candidate.route === route)) {
      it(row.name, () => run(row));
    }
  });
}

describe("coverage guard", () => {
  it("has rows, including a recorded call chain, for every route file under src/pages/api except auth", () => {
    const apiDir = fileURLToPath(new URL("../../src/pages/api", import.meta.url));
    // Every route family except auth (no data routes), so a new family turns this red by name.
    const dirs = readdirSync(apiDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "auth")
      .map((entry) => entry.name)
      .sort();
    expect(dirs).toEqual(["account", "groups", "tasks"]);
    const files = dirs.flatMap((dir) =>
      readdirSync(`${apiDir}/${dir}`)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => `${dir}/${name.slice(0, -3)}`),
    );
    expect(files).toHaveLength(14);
    const covered = new Set<string>(ROWS.map((row) => row.route));
    const withChain = new Set<string>(ROWS.filter((row) => row.expect.calls).map((row) => row.route));
    for (const file of files) {
      expect(covered.has(file), `${file} has no rows`).toBe(true);
      expect(withChain.has(file), `${file} has no row with a recorded call chain`).toBe(true);
    }
  });

  it("gives every row a distinct title within its route", () => {
    const titles = ROWS.map((row) => `${row.route}: ${row.name}`);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
