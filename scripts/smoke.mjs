// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

import { Buffer } from "node:buffer";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const stamp = Date.now();
const email = `smoke-${stamp}@example.com`;
const emailB = `smoke-b-${stamp}@example.com`;
const emailC = `smoke-c-${stamp}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const groupName = `Smoke Group ${stamp}`;
// Deliberately not containing groupName, so "the old name is gone" can be asserted with a plain substring check.
const renamedGroupName = `Renamed Crew ${stamp}`;
// Unique titles: the renamed one does not contain the old one, so "the old title is gone" is a plain substring check.
const taskTitle = `Smoke Task ${stamp}`;
const renamedTaskTitle = `Edited Chore ${stamp}`;
// A second task, of the `once` kind: unique and not containing the other titles, so the row regexes cannot mix them up.
const onceTitle = `Smoke Once ${stamp}`;
// User A's session and the sessions of users B and C are independent cookie jars.
const jarA = new Map();
const jarB = new Map();
const jarC = new Map();
// An Origin that is not the app's own (CSRF check).
const FOREIGN_ORIGIN = "http://evil.example";
// Read from A's dashboard at run time and used by the later invite steps.
let joinCode;
// Read from the owner's dashboard at run time: the ids A's remove controls submit for users B and C.
let memberIdB;
let memberIdC;
// Read from A's rendered delete form: the id of the task A creates.
let taskId;
// Read from A's rendered Mark done form: the id of the `once` task A creates.
let onceTaskId;
// Read from B's first JSON check-off answer: the period the repeated tick has to answer with again.
let tickedPeriod;
// A well-formed task id that no task has.
const UNKNOWN_TASK_ID = "00000000-0000-4000-8000-000000000000";
// Makes a check-off route answer in JSON instead of redirecting.
const JSON_ACCEPT = { Accept: "application/json" };
// What a browser sends with a form submit: `*/*` is no request for JSON, so the check-off routes must redirect.
const BROWSER_ACCEPT = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
// Every JSON answer of a check-off route must stay out of caches.
const NO_STORE = { name: "Cache-Control", includes: "no-store" };

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response, jar) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    // Astro's cookies.delete() sends `Expires=<1970>` without Max-Age, so a past Expires also means deletion.
    const expired = attrs.some((a) => {
      const attr = a.trim();
      return /^max-age=0$/i.test(attr) || (/^expires=/i.test(attr) && Date.parse(attr.slice(8)) < Date.now());
    });
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

// `jar` selects the session (default: user A). `cookie` replaces the jar's cookies for this request and
// keeps the response's Set-Cookie out of the jar. `origin` overrides the Origin header (CSRF check).
// `headers` adds request headers (the check-off routes answer JSON to `Accept: application/json`).
async function request(path, { method = "GET", form, cookie, jar = jarA, origin = BASE_URL, headers = {} } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookie ?? cookieHeader(jar),
      Origin: origin,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...headers,
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  if (cookie === undefined) storeCookies(response, jar);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    setCookies: response.headers.getSetCookie(),
    headers: response.headers,
    body: await response.text(),
  };
}

// The Warsaw calendar day as YYYY-MM-DD. Computed here, not with the app's own code (src/lib/streak-rules.ts), so the
// JSON steps check the period against an oracle that shares nothing with the answer.
const warsawDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function warsawDay() {
  const parts = Object.fromEntries(warsawDayFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// A form POST that asks for the JSON answer, bracketed by the Warsaw day: a request answered across midnight may carry
// either day, so both are returned for `periodAnswer`.
async function postForJson(route, form, jar) {
  const before = warsawDay();
  const result = await request(route, { method: "POST", form, jar, headers: JSON_ACCEPT });
  return { ...result, days: [before, warsawDay()] };
}

// What a successful JSON answer must be, byte for byte: ok, and the Warsaw day the request was made on. A body that
// is an error answer, carries extra fields or names another day does not match.
const periodAnswer = (days) => ({
  status: 200,
  header: NO_STORE,
  bodyMatches: [new RegExp(`^\\{"ok":true,"period":"(?:${[...new Set(days)].join("|")})"\\}$`)],
});

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The group name inside the group card's heading (an error alert or the join card would not match).
function groupHeading(name) {
  return new RegExp(`<h1[^>]*>\\s*${escapeRegExp(name)}\\s*</h1>`);
}

// A member row (<li>) of the Members card that contains the given email followed by the given marker badge. The match
// starts after the "Members" heading and may not cross the card's closing </ul>: the Leaderboard repeats every email and
// the viewer's "You" pill, so an unanchored match would be satisfied by the Leaderboard row instead.
function memberRow(memberEmail, marker) {
  return new RegExp(
    `<h2[^>]*>\\s*Members\\s*</h2>(?:(?!</ul>)[\\s\\S])*?<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(memberEmail)}(?:(?!</li>)[\\s\\S])*>\\s*${marker}\\s*<`,
  );
}

// The form the component rendered posts to `route` (the card heading and the serialised island props would not match).
function formPostingTo(route) {
  return new RegExp(`<form[^>]*action="${escapeRegExp(route)}"`);
}

// A member row (<li>) that contains the given email and, after it, a form posting to the remove-member route.
function rowWithRemoveControl(memberEmail) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(memberEmail)}(?:(?!</li>)[\\s\\S])*action="/api/groups/remove-member"`,
  );
}

// A member row whose remove control is the confirmation island: the form and, after it, the dialog trigger.
function rowWithConfirmedRemoveControl(memberEmail) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(memberEmail)}(?:(?!</li>)[\\s\\S])*action="/api/groups/remove-member"(?:(?!</li>)[\\s\\S])*aria-haspopup="dialog"`,
  );
}

// The id the remove control in the row of the given member submits (the island's serialised props do not contain this markup).
function removeTargetInRow(body, memberEmail) {
  const row = new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(memberEmail)}(?:(?!</li>)[\\s\\S])*name="user_id"[^>]*value="([0-9a-f-]{36})"`,
  );
  return body.match(row)?.[1];
}

// A task row (<li>) whose participant line lists the given email after the task title. Emails also appear in the
// Members card, so only a row-scoped match proves who takes part in which task. With `you`, the email is directly
// followed by the "You" marker; a marker on another participant's entry would not match.
function taskRowListing(title, participantEmail, { you = false } = {}) {
  const marker = you ? `</span>\\s*<span[^>]*>\\s*You\\s*</span>` : "";
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*${escapeRegExp(participantEmail)}${marker}`,
  );
}

// A task row with a plain server-rendered form posting to the route (the Join control).
function taskRowWithForm(title, route) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*<form[^>]*action="${escapeRegExp(route)}"`,
  );
}

// A task row whose Leave control is the confirmation island: the form and, after it, the dialog trigger.
function taskRowWithConfirmedLeave(title) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*action="/api/tasks/leave"(?:(?!</li>)[\\s\\S])*aria-haspopup="dialog"`,
  );
}

// The id the form posting to `route` in the row of the given task submits.
function taskTargetInRow(body, title, route) {
  const row = new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*action="${escapeRegExp(route)}"(?:(?!</li>)[\\s\\S])*name="task_id"[^>]*value="([0-9a-f-]{36})"`,
  );
  return body.match(row)?.[1];
}

// The button label each check-off form carries: "Mark done" ticks the current period, "Undo" takes the tick back.
const CHECKOFF_BUTTONS = { "/api/tasks/checkoff": "Mark done", "/api/tasks/uncheck": "Undo" };

// A task row (<li>) with the check-off or undo form: it posts to the route and holds its labelled submit button. The
// task id the form carries is read with `taskTargetInRow`.
function taskRowWithCheckoffForm(title, route) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*<form[^>]*action="${escapeRegExp(route)}"[^>]*>(?:(?!</form>)[\\s\\S])*<button[^>]*type="submit"[^>]*>\\s*${CHECKOFF_BUTTONS[route]}\\s*</button>`,
  );
}

// A task row (<li>) whose check-off status element reads exactly `text` ("Done today"), after the title.
function taskRowWithStatus(title, text) {
  return taskRowWithBadge(title, escapeRegExp(text));
}

// A task row (<li>) with the "Streak" label element followed by an element holding only the number `n`. Without `n`
// it matches the label alone (a `once` task shows no streak figure at all).
function taskRowStreak(title, n) {
  const figure = n === undefined ? "" : `\\s*<span[^>]*>\\s*${n}\\s*</span>`;
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*>\\s*Streak\\s*</span>${figure}`,
  );
}

// A row of the Leaderboard: a <li> inside <ol aria-label="Leaderboard"> that holds the position, the email, the "You"
// pill and the total, each in its own element and in this order. `you` true requires the pill, false forbids it,
// undefined accepts either. The Members card repeats the emails and the pill, so only this match proves what the board
// shows.
function leaderboardRow(rowEmail, position, total, { you } = {}) {
  const pill =
    you === undefined ? "(?:<span[^>]*>\\s*You\\s*</span>\\s*)?" : you ? "<span[^>]*>\\s*You\\s*</span>\\s*" : "";
  return new RegExp(
    `<ol[^>]*aria-label="Leaderboard"[^>]*>(?:(?!</ol>)[\\s\\S])*?<li[^>]*>\\s*<span[^>]*>\\s*${position}\\s*</span>\\s*<span[^>]*>\\s*${escapeRegExp(rowEmail)}\\s*</span>\\s*${pill}<span[^>]*>\\s*${total}\\s*</span>\\s*</li>`,
  );
}

// A destructive control must go through the confirmation dialog: Radix renders its trigger with aria-haspopup="dialog"
// (the dialog itself is not server-rendered), which a plain <form><button type="submit"> would lack.
function dialogTrigger(label) {
  return new RegExp(`<button[^>]*aria-haspopup="dialog"[^>]*>\\s*${escapeRegExp(label)}\\s*<`);
}

// The server-rendered destructive forms hold hidden fields only; a submit button inside one would skip the confirmation.
const SUBMIT_IN_DESTRUCTIVE_FORM =
  /<form[^>]*action="\/api\/(?:groups\/(?:delete|remove-member)|tasks\/delete)"[^>]*>(?:(?!<\/form>)[\s\S])*type="submit"/;

// The Tasks card heading (an error alert or another card would not match).
const TASKS_HEADING = /<h2[^>]*>\s*Tasks\s*<\/h2>/;

// A task row (<li>) holding the title followed by the recurrence badge.
function taskRowWithBadge(title, badge) {
  return new RegExp(`<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*>\\s*${badge}\\s*<`);
}

// The edit control the island rendered for the task (its button carries the title in the aria-label).
function editControl(title) {
  return new RegExp(`<button[^>]*aria-label="Edit ${escapeRegExp(title)}"`);
}

// A task row whose delete control is the confirmation island: the form and, after it, the dialog trigger.
function taskRowWithConfirmedDelete(title) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*action="/api/tasks/delete"(?:(?!</li>)[\\s\\S])*aria-haspopup="dialog"`,
  );
}

// The id the delete control in the row of the given task submits.
function deleteTargetInRow(body, title) {
  const row = new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(title)}(?:(?!</li>)[\\s\\S])*action="/api/tasks/delete"(?:(?!</li>)[\\s\\S])*name="task_id"[^>]*value="([0-9a-f-]{36})"`,
  );
  return body.match(row)?.[1];
}

// The id a signed-in session belongs to, read from the Supabase auth cookie in the jar (`base64-` plus base64url JSON,
// split into numbered chunks when large). The remove-member steps need real ids to prove who may remove whom.
function sessionUserId(jar) {
  const value = [...jar.entries()]
    .filter(([name]) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, chunk]) => chunk)
    .join("");
  let id;
  try {
    id = JSON.parse(Buffer.from(value.replace(/^base64-/, ""), "base64url").toString("utf8")).user?.id;
  } catch {
    id = undefined;
  }
  if (typeof id !== "string") {
    console.log("FAIL  session user id not found in the cookie jar; later remove-member steps cannot run");
    process.exit(1);
  }
  return id;
}

const NO_ERROR_ALERT = 'role="alert"';
// Only the rendered read-only input carries this label; the invite URL also sits in the island's serialised props.
const INVITE_INPUT = 'aria-label="Invite link"';

// B's dashboard while B takes part in the daily task and nothing is ticked: the row offers the tick with a streak of 0
// and A, B and C all share position 1 with a total of 0. B's Leave dialogs (island props in the server HTML) warn that
// leaving erases the streaks.
const B_NOTHING_TICKED = {
  status: 200,
  bodyIncludes: ["and your streak on it will be lost", "and your streaks in its tasks will be lost"],
  bodyMatches: [
    taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/checkoff"),
    taskRowStreak(renamedTaskTitle, 0),
    leaderboardRow(email, 1, 0, { you: false }),
    leaderboardRow(emailB, 1, 0, { you: true }),
    leaderboardRow(emailC, 1, 0, { you: false }),
  ],
  bodyNotMatches: [
    taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/uncheck"),
    taskRowWithStatus(renamedTaskTitle, "Done today"),
  ],
  bodyExcludes: NO_ERROR_ALERT,
};

// B's dashboard while only B has ticked today: the row shows the status, Undo and a streak of 1, B leads the board with
// a total of 1 and A and C share position 2 with 0.
const B_TICKED = {
  status: 200,
  bodyMatches: [
    taskRowWithStatus(renamedTaskTitle, "Done today"),
    taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/uncheck"),
    taskRowStreak(renamedTaskTitle, 1),
    leaderboardRow(emailB, 1, 1, { you: true }),
    leaderboardRow(email, 2, 0, { you: false }),
    leaderboardRow(emailC, 2, 0, { you: false }),
  ],
  bodyNotMatches: taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/checkoff"),
  bodyExcludes: NO_ERROR_ALERT,
};

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["signin page renders for anonymous user", () => request("/auth/signin"), { status: 200 }],
  ["signup page renders for anonymous user", () => request("/auth/signup"), { status: 200 }],
  [
    "signup page does not reflect a foreign error",
    () => request("/auth/signup?error=Injected%20message"),
    { status: 200, bodyExcludes: "Injected message" },
  ],
  [
    "signup page shows a known error code",
    () => request("/auth/signup?error=email_taken"),
    { status: 200, bodyIncludes: "already exists" },
  ],
  [
    // A GET is exempt from the Origin check, so the confirmation link works from a mail client.
    "confirmation callback without a code ends on signin with link_expired",
    () => request("/auth/callback"),
    { status: 302, locationExact: "/auth/signin?error=link_expired" },
  ],
  [
    "signin page shows the expired-link message",
    () => request("/auth/signin?error=link_expired"),
    { status: 200, bodyIncludes: "expired or was already used" },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signup rejects duplicate email",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/signup?error=email_taken", setCookie: "auth_email=" },
  ],
  [
    "signup rejects weak password",
    () => request("/api/auth/signup", { method: "POST", form: { email: `weak-${email}`, password: "12345" } }),
    { status: 302, location: "/auth/signup?error=weak_password" },
  ],
  [
    "signup rejects password over 72 characters",
    () => request("/api/auth/signup", { method: "POST", form: { email: `long-${email}`, password: "a".repeat(73) } }),
    { status: 302, location: "/auth/signup?error=invalid_input" },
  ],
  [
    "signup rejects malformed email",
    () => request("/api/auth/signup", { method: "POST", form: { email: "not-an-email", password } }),
    { status: 302, location: "/auth/signup?error=invalid_input" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=invalid_credentials", setCookie: "auth_email=" },
  ],
  [
    "signin page prefills and consumes the remembered email",
    () => request("/auth/signin?error=invalid_credentials", { cookie: `auth_email=${encodeURIComponent(email)}` }),
    { status: 200, bodyIncludes: email, setCookie: "auth_email=deleted" },
  ],
  [
    "signin page ignores the remembered email without an error",
    () => request("/auth/signin", { cookie: `auth_email=${encodeURIComponent(email)}` }),
    { status: 200, bodyExcludes: email, setCookie: "auth_email=deleted" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  [
    "anonymous group create redirects to signin",
    () => request("/api/groups/create", { method: "POST", form: { name: groupName }, jar: jarB }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    // An empty name has no side effect if the Origin check were ever off (it would answer 302 invalid_name).
    "group create from a foreign origin is rejected",
    () => request("/api/groups/create", { method: "POST", form: { name: "  " }, origin: FOREIGN_ORIGIN }),
    { status: 403 },
  ],
  [
    "group create rejects an empty name",
    () => request("/api/groups/create", { method: "POST", form: { name: "  " } }),
    { status: 302, location: "/dashboard?error=invalid_name" },
  ],
  [
    "group create succeeds",
    () => request("/api/groups/create", { method: "POST", form: { name: groupName } }),
    { status: 302, locationExact: "/dashboard", setCookie: "join_code=deleted" },
  ],
  ...["create", "update", "delete", "join", "leave", "checkoff", "uncheck"].flatMap((action) => [
    [
      `anonymous task ${action} redirects to signin`,
      () => request(`/api/tasks/${action}`, { method: "POST", form: { title: "Water plants" }, jar: jarB }),
      { status: 302, location: "/auth/signin" },
    ],
    [
      // The bodies are invalid, so nothing changes even if the Origin check were off.
      `task ${action} from a foreign origin is rejected`,
      () => request(`/api/tasks/${action}`, { method: "POST", form: {}, origin: FOREIGN_ORIGIN }),
      { status: 403 },
    ],
  ]),
  [
    "task create rejects an empty title",
    () => request("/api/tasks/create", { method: "POST", form: { title: "  ", recurrence: "once" } }),
    { status: 302, locationExact: "/dashboard?error=invalid_title" },
  ],
  [
    "task create rejects an unknown recurrence",
    () => request("/api/tasks/create", { method: "POST", form: { title: "Water plants", recurrence: "monthly" } }),
    { status: 302, locationExact: "/dashboard?error=invalid_recurrence" },
  ],
  [
    "task update rejects a malformed task id",
    () => request("/api/tasks/update", { method: "POST", form: { task_id: "not-a-uuid", title: "Renamed" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "task delete rejects a malformed task id",
    () => request("/api/tasks/delete", { method: "POST", form: { task_id: "not-a-uuid" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "task join rejects a malformed task id",
    () => request("/api/tasks/join", { method: "POST", form: { task_id: "not-a-uuid" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "task leave rejects a malformed task id",
    () => request("/api/tasks/leave", { method: "POST", form: { task_id: "not-a-uuid" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "task checkoff rejects a malformed task id",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: "not-a-uuid" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "task uncheck rejects a malformed task id",
    () => request("/api/tasks/uncheck", { method: "POST", form: { task_id: "not-a-uuid" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  ["task update does not answer GET", () => request("/api/tasks/update"), { status: 404 }],
  ["task delete does not answer GET", () => request("/api/tasks/delete"), { status: 404 }],
  ["task join does not answer GET", () => request("/api/tasks/join"), { status: 404 }],
  ["task leave does not answer GET", () => request("/api/tasks/leave"), { status: 404 }],
  ["task checkoff does not answer GET", () => request("/api/tasks/checkoff"), { status: 404 }],
  ["task uncheck does not answer GET", () => request("/api/tasks/uncheck"), { status: 404 }],
  // The loop above sends no Accept header, so the JSON mode gets its own boundary steps.
  ...["checkoff", "uncheck"].flatMap((action) => [
    [
      // A lost session answers with this redirect, not with JSON: the island maps it to a failed tick.
      `anonymous task ${action} in JSON mode redirects to signin`,
      () =>
        request(`/api/tasks/${action}`, {
          method: "POST",
          form: { task_id: UNKNOWN_TASK_ID },
          jar: jarB,
          headers: JSON_ACCEPT,
        }),
      { status: 302, locationExact: "/auth/signin" },
    ],
    [
      // The body is invalid, so nothing changes even if the Origin check were off (it would answer 400 invalid).
      `task ${action} from a foreign origin in JSON mode is rejected`,
      () => request(`/api/tasks/${action}`, { method: "POST", form: {}, origin: FOREIGN_ORIGIN, headers: JSON_ACCEPT }),
      { status: 403 },
    ],
  ]),
  [
    "dashboard shows the group and its invite link",
    async () => {
      const result = await request("/dashboard");
      joinCode = result.body.match(/\/join\/([0-9a-f]+)/)?.[1];
      if (!joinCode) {
        console.log("FAIL  invite code not found in the group owner's dashboard; later invite steps cannot run");
        process.exit(1);
      }
      return result;
    },
    { status: 200, bodyIncludes: [groupName, "/join/"] },
  ],
  [
    "second group create is rejected",
    () => request("/api/groups/create", { method: "POST", form: { name: `${groupName} 2` } }),
    { status: 302, location: "/dashboard?error=already_in_group" },
  ],
  [
    "invite link stores the code for an anonymous visitor",
    () => request(`/join/${joinCode}`, { jar: jarB }),
    { status: 302, locationExact: "/dashboard", setCookie: "join_code=" },
  ],
  [
    "user B signs up",
    () => request("/api/auth/signup", { method: "POST", form: { email: emailB, password }, jar: jarB }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "user B signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email: emailB, password }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "dashboard previews the pending invite for user B",
    () => request("/dashboard", { jar: jarB }),
    // The confirm button proves the join card rendered (the name alone would also appear next to an error);
    // a non-member must not see the invite link.
    { status: 200, bodyIncludes: [groupName, "Join group"], bodyExcludes: "/join/" },
  ],
  [
    "join rejects a malformed code",
    () => request("/api/groups/join", { method: "POST", form: { code: "not-a-code!" }, jar: jarB }),
    { status: 302, location: "/dashboard?error=invalid_code" },
  ],
  [
    "join rejects an unknown code",
    () => request("/api/groups/join", { method: "POST", form: { code: "deadbeef0000" }, jar: jarB }),
    { status: 302, location: "/dashboard?error=invalid_code" },
  ],
  [
    "join with the invite code succeeds",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarB }),
    { status: 302, locationExact: "/dashboard", setCookie: "join_code=deleted" },
  ],
  [
    "dashboard shows the group to user B after joining",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: ["Your group", groupName, "/join/"],
      bodyExcludes: ["Join group", "Create a group"],
    },
  ],
  [
    "joining again is rejected",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarB }),
    { status: 302, location: "/dashboard?error=already_in_group", setCookie: "join_code=deleted" },
  ],
  [
    "dashboard shows the member list to user B",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      // The count is one string ("2 members"): Astro drops the space between two adjacent expressions.
      bodyIncludes: [email, emailB, INVITE_INPUT, "2 members"],
      bodyMatches: [
        memberRow(email, "Owner"),
        memberRow(emailB, "You"),
        groupHeading(groupName),
        // The leave control itself, not just its card heading.
        formPostingTo("/api/groups/leave"),
      ],
      // The markers sit on the right rows only.
      bodyNotMatches: [memberRow(email, "You"), memberRow(emailB, "Owner")],
      // A member sees no owner controls and no error alert.
      bodyExcludes: ["Rename group", NO_ERROR_ALERT],
    },
  ],
  [
    "rename by a non-owner is rejected",
    () => request("/api/groups/rename", { method: "POST", form: { name: renamedGroupName }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "group name is unchanged after the rejected rename",
    () => request("/dashboard", { jar: jarB }),
    { status: 200, bodyMatches: [groupHeading(groupName)], bodyExcludes: renamedGroupName },
  ],
  [
    "rename rejects an empty name",
    () => request("/api/groups/rename", { method: "POST", form: { name: "  " } }),
    { status: 302, locationExact: "/dashboard?error=invalid_name" },
  ],
  [
    "rename by the owner succeeds",
    () => request("/api/groups/rename", { method: "POST", form: { name: renamedGroupName } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "owner dashboard shows the new name, both members and no leave control",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: [email, emailB, INVITE_INPUT],
      bodyMatches: [
        groupHeading(renamedGroupName),
        memberRow(email, "Owner"),
        memberRow(email, "You"),
        // The rename form itself (posting the `name` field), not just its card heading.
        formPostingTo("/api/groups/rename"),
        /<input[^>]*name="name"/,
      ],
      // B is neither the owner nor the current user.
      bodyNotMatches: [memberRow(emailB, "You"), memberRow(emailB, "Owner")],
      bodyExcludes: [groupName, "Leave group", NO_ERROR_ALERT],
    },
  ],
  [
    "leave by the owner is rejected",
    () => request("/api/groups/leave", { method: "POST" }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "owner still has the group after the rejected leave",
    () => request("/dashboard"),
    { status: 200, bodyMatches: [groupHeading(renamedGroupName)], bodyExcludes: NO_ERROR_ALERT },
  ],
  [
    "leave by a member succeeds",
    () => request("/api/groups/leave", { method: "POST", jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "dashboard shows the create form to user B after leaving",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: ["Create a group", "Join a group"],
      bodyExcludes: ["Your group", renamedGroupName, "/join/", NO_ERROR_ALERT],
    },
  ],
  [
    "leaving again after having left is not an error",
    () => request("/api/groups/leave", { method: "POST", jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "user B joins again with the same code",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "dashboard shows the renamed group to user B after rejoining",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), memberRow(emailB, "You")],
      bodyExcludes: ["Create a group", NO_ERROR_ALERT],
    },
  ],
  [
    // A third member: with a single non-owner, "removes exactly the target" cannot be told from "removes every
    // non-owner". With email confirmation disabled a successful signup already leaves a session in the jar.
    "user C signs up",
    () => request("/api/auth/signup", { method: "POST", form: { email: emailC, password }, jar: jarC }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "user C joins the group with the invite code",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarC }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "dashboard shows the group to user C after joining",
    () => request("/dashboard", { jar: jarC }),
    {
      status: 200,
      bodyIncludes: "3 members",
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), memberRow(emailC, "You")],
      bodyExcludes: ["Create a group", NO_ERROR_ALERT],
    },
  ],
  [
    "owner dashboard offers to remove the other members and to delete the group",
    async () => {
      const result = await request("/dashboard");
      memberIdB = removeTargetInRow(result.body, emailB);
      memberIdC = removeTargetInRow(result.body, emailC);
      // Each control has to submit its member's real id, or the removal steps below would prove nothing.
      if (!memberIdB || memberIdB !== sessionUserId(jarB) || !memberIdC || memberIdC !== sessionUserId(jarC)) {
        console.log(
          "FAIL  the owner's remove controls do not carry the ids of users B and C; later remove-member steps cannot run",
        );
        process.exit(1);
      }
      return result;
    },
    {
      status: 200,
      bodyIncludes: "3 members",
      bodyMatches: [
        groupHeading(renamedGroupName),
        // Each control sits on its member's row and opens the confirmation dialog; the owner's own row has none.
        rowWithConfirmedRemoveControl(emailB),
        rowWithConfirmedRemoveControl(emailC),
        formPostingTo("/api/groups/delete"),
        dialogTrigger("Delete group"),
      ],
      bodyNotMatches: [rowWithRemoveControl(email), SUBMIT_IN_DESTRUCTIVE_FORM],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "member dashboard offers no remove or delete controls",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      // The leave control proves the member view rendered; the owner-only forms must be absent, not just unlabelled.
      bodyMatches: [formPostingTo("/api/groups/leave")],
      bodyNotMatches: [formPostingTo("/api/groups/remove-member"), formPostingTo("/api/groups/delete")],
      bodyExcludes: ["Delete group", NO_ERROR_ALERT],
    },
  ],
  [
    "remove-member by a non-owner is rejected",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: sessionUserId(jarA) }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // A fellow member is no owner either: the refusal is not only for the owner as the target.
    "remove-member of a fellow member by a non-owner is rejected",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: memberIdC }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "remove-member of oneself is refused",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: sessionUserId(jarB) }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // The self check must not be case-sensitive: the policy for leaving would accept the upper-case spelling.
    "remove-member of oneself in upper case is refused too",
    () =>
      request("/api/groups/remove-member", {
        method: "POST",
        form: { user_id: sessionUserId(jarB).toUpperCase() },
        jar: jarB,
      }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // Postgres reads a hyphenless uuid as the same id: it must never delete the caller's own row through this route.
    "remove-member of oneself without hyphens is refused",
    () =>
      request("/api/groups/remove-member", {
        method: "POST",
        form: { user_id: sessionUserId(jarB).replaceAll("-", "") },
        jar: jarB,
      }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // Without validation PostgREST would answer 22P02 and the page would say "Something went wrong" instead.
    "remove-member rejects a malformed user id",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: "not-a-uuid" } }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "delete by a non-owner is rejected",
    () => request("/api/groups/delete", { method: "POST", jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // As a non-owner B could not remove anyone even if the Origin check were off (it would answer 302 forbidden).
    "remove-member from a foreign origin is rejected",
    () =>
      request("/api/groups/remove-member", {
        method: "POST",
        form: { user_id: memberIdC },
        jar: jarB,
        origin: FOREIGN_ORIGIN,
      }),
    { status: 403 },
  ],
  [
    "delete from a foreign origin is rejected",
    () => request("/api/groups/delete", { method: "POST", form: {}, jar: jarB, origin: FOREIGN_ORIGIN }),
    { status: 403 },
  ],
  [
    // Safe methods skip the Origin check and SameSite=Lax cookies travel on cross-site top-level GETs, so a GET handler
    // on a destructive route would be a CSRF hole.
    "remove-member does not answer GET",
    () => request("/api/groups/remove-member", { jar: jarB }),
    { status: 404 },
  ],
  ["delete does not answer GET", () => request("/api/groups/delete", { jar: jarB }), { status: 404 }],
  [
    "group and all three members are intact after the rejected requests",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: ["3 members", emailC],
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), memberRow(emailB, "You")],
      bodyExcludes: ["Create a group", NO_ERROR_ALERT],
    },
  ],
  [
    "remove-member by the owner succeeds",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: memberIdB } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "removed user B sees the create form",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: ["Create a group", "Join a group"],
      bodyExcludes: ["Your group", renamedGroupName, "/join/", NO_ERROR_ALERT],
    },
  ],
  [
    "owner dashboard lists the owner and user C after removing user B",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: "2 members",
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), rowWithConfirmedRemoveControl(emailC)],
      bodyNotMatches: [rowWithRemoveControl(emailB)],
      bodyExcludes: [emailB, NO_ERROR_ALERT],
    },
  ],
  [
    // Removing B has to remove exactly B.
    "user C still has the group after user B was removed",
    () => request("/dashboard", { jar: jarC }),
    {
      status: 200,
      bodyIncludes: "2 members",
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), memberRow(emailC, "You")],
      bodyExcludes: [emailB, "Create a group", NO_ERROR_ALERT],
    },
  ],
  [
    // A double click or a stale page: the target is gone already, which is not the owner's mistake.
    "removing an already removed member is not an error",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: memberIdB } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "user B joins again with the same code after being removed",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "dashboard shows the group to user B after being re-added",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), memberRow(emailB, "You")],
      bodyExcludes: ["Create a group", NO_ERROR_ALERT],
    },
  ],
  [
    "task create by the creator succeeds",
    () => request("/api/tasks/create", { method: "POST", form: { title: taskTitle, recurrence: "daily" } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "creator dashboard shows the task with edit and confirmed delete controls",
    async () => {
      const result = await request("/dashboard");
      taskId = deleteTargetInRow(result.body, taskTitle);
      if (!taskId) {
        console.log("FAIL  task id not found in the creator's delete form; later task steps cannot run");
        process.exit(1);
      }
      return result;
    },
    {
      status: 200,
      bodyIncludes: taskTitle,
      bodyMatches: [
        TASKS_HEADING,
        taskRowWithBadge(taskTitle, "Daily"),
        editControl(taskTitle),
        taskRowWithConfirmedDelete(taskTitle),
        formPostingTo("/api/tasks/create"),
        // The creator is enrolled at task insert, so the fresh row already lists them, marked as the viewer.
        taskRowListing(taskTitle, email, { you: true }),
      ],
      bodyNotMatches: [SUBMIT_IN_DESTRUCTIVE_FORM, taskRowListing(taskTitle, emailB)],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "member dashboard shows the task without edit and delete controls",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: taskTitle,
      bodyMatches: [TASKS_HEADING, taskRowWithBadge(taskTitle, "Daily")],
      // The update form is never server-rendered (it appears only after a click), so editControl is the guard.
      bodyNotMatches: [editControl(taskTitle), formPostingTo("/api/tasks/delete")],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "task update by a non-creator is rejected",
    () =>
      request("/api/tasks/update", { method: "POST", form: { task_id: taskId, title: renamedTaskTitle }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "task delete by a non-creator is rejected",
    () => request("/api/tasks/delete", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // The creator's own session and a real id: only the Origin check stands between the request and the change.
    "task update from a foreign origin is rejected",
    () =>
      request("/api/tasks/update", {
        method: "POST",
        form: { task_id: taskId, title: renamedTaskTitle },
        origin: FOREIGN_ORIGIN,
      }),
    { status: 403 },
  ],
  [
    "task delete from a foreign origin is rejected",
    () => request("/api/tasks/delete", { method: "POST", form: { task_id: taskId }, origin: FOREIGN_ORIGIN }),
    { status: 403 },
  ],
  [
    "task is intact after the rejected requests",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: taskTitle,
      bodyMatches: [taskRowWithBadge(taskTitle, "Daily"), taskRowWithConfirmedDelete(taskTitle)],
      bodyExcludes: [renamedTaskTitle, NO_ERROR_ALERT],
    },
  ],
  [
    // The posted recurrence must be ignored: the endpoint only ever updates the title.
    "task update by the creator succeeds",
    () =>
      request("/api/tasks/update", {
        method: "POST",
        form: { task_id: taskId, title: renamedTaskTitle, recurrence: "weekly" },
      }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "member dashboard shows the new title and the unchanged recurrence",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: renamedTaskTitle,
      bodyMatches: [taskRowWithBadge(renamedTaskTitle, "Daily")],
      bodyNotMatches: taskRowWithBadge(renamedTaskTitle, "Weekly"),
      bodyExcludes: [taskTitle, NO_ERROR_ALERT],
    },
  ],
  [
    "member dashboard lists the creator on the task and offers to join it",
    async () => {
      const result = await request("/dashboard", { jar: jarB });
      // The Join control has to submit the real task id, or the join steps below would prove nothing.
      if (taskTargetInRow(result.body, renamedTaskTitle, "/api/tasks/join") !== taskId) {
        console.log("FAIL  the member's Join control does not carry the task id; later participation steps cannot run");
        process.exit(1);
      }
      return result;
    },
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email),
        // The creator's entry carries no "You" marker in B's view.
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
      ],
      bodyNotMatches: [
        taskRowListing(renamedTaskTitle, email, { you: true }),
        taskRowListing(renamedTaskTitle, emailB),
        taskRowWithConfirmedLeave(renamedTaskTitle),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "task join by a member succeeds",
    () => request("/api/tasks/join", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "joined member is listed on the task and offered to leave it",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email),
        taskRowListing(renamedTaskTitle, emailB, { you: true }),
        taskRowWithConfirmedLeave(renamedTaskTitle),
      ],
      bodyNotMatches: [
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
        taskRowListing(renamedTaskTitle, email, { you: true }),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "creator dashboard lists the member who joined",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email, { you: true }),
        taskRowListing(renamedTaskTitle, emailB),
        taskRowWithConfirmedDelete(renamedTaskTitle),
        taskRowWithConfirmedLeave(renamedTaskTitle),
      ],
      bodyNotMatches: taskRowListing(renamedTaskTitle, emailB, { you: true }),
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "joining the task again is a quiet redirect",
    () => request("/api/tasks/join", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "participants are unchanged after the repeated join",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email),
        taskRowListing(renamedTaskTitle, emailB, { you: true }),
        taskRowWithConfirmedLeave(renamedTaskTitle),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "joining a task that does not exist is a quiet redirect",
    () =>
      request("/api/tasks/join", {
        method: "POST",
        form: { task_id: "00000000-0000-4000-8000-000000000000" },
        jar: jarB,
      }),
    { status: 302, locationExact: "/dashboard" },
  ],
  ...["checkoff", "uncheck"].flatMap((action) => [
    [
      `task ${action} of a task that does not exist is a quiet redirect`,
      () => request(`/api/tasks/${action}`, { method: "POST", form: { task_id: UNKNOWN_TASK_ID }, jar: jarB }),
      { status: 302, locationExact: "/dashboard" },
    ],
    [
      `task ${action} of a task that does not exist answers gone in JSON mode`,
      () =>
        request(`/api/tasks/${action}`, {
          method: "POST",
          form: { task_id: UNKNOWN_TASK_ID },
          jar: jarB,
          headers: JSON_ACCEPT,
        }),
      { status: 404, header: NO_STORE, bodyIncludes: ['"ok":false', '"error":"gone"'] },
    ],
    [
      `task ${action} with a malformed id answers invalid in JSON mode`,
      () =>
        request(`/api/tasks/${action}`, {
          method: "POST",
          form: { task_id: "not-a-uuid" },
          jar: jarB,
          headers: JSON_ACCEPT,
        }),
      { status: 400, header: NO_STORE, bodyIncludes: ['"ok":false', '"error":"invalid"'] },
    ],
  ]),
  [
    // The task exists and B takes part in it. The steps tick and undo again, so no state is left for the later steps.
    "user B's JSON checkoff ticks the Warsaw day",
    async () => {
      const result = await postForJson("/api/tasks/checkoff", { task_id: taskId }, jarB);
      tickedPeriod = result.body.match(/"period":"(\d{4}-\d{2}-\d{2})"/)?.[1];
      if (!tickedPeriod) {
        console.log(
          `FAIL  user B's JSON checkoff answered ${result.status} without a period; later check-off steps cannot run`,
        );
        process.exit(1);
      }
      return result;
    },
    (actual) => periodAnswer(actual.days),
  ],
  [
    "repeating the JSON checkoff answers the same period",
    () => postForJson("/api/tasks/checkoff", { task_id: taskId }, jarB),
    // The period of the first tick; a repeat that crosses Warsaw midnight may legitimately carry the new day instead.
    (actual) => periodAnswer([tickedPeriod, ...actual.days]),
  ],
  [
    // C is a member of the group but never joined the task: the foreign key to the participation refuses the tick.
    "JSON checkoff by a member who never joined the task is forbidden",
    () =>
      request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarC, headers: JSON_ACCEPT }),
    { status: 403, header: NO_STORE, bodyIncludes: ['"ok":false', '"error":"forbidden"'] },
  ],
  [
    "user B's JSON uncheck answers ok",
    () => postForJson("/api/tasks/uncheck", { task_id: taskId }, jarB),
    (actual) => periodAnswer(actual.days),
  ],
  [
    "repeating the JSON uncheck is a quiet ok",
    () => postForJson("/api/tasks/uncheck", { task_id: taskId }, jarB),
    (actual) => periodAnswer(actual.days),
  ],
  [
    // The no-JavaScript path: a browser form post (no JSON `Accept`) ends in a redirect. B's tick is undone below, so
    // the state is empty again before and after these four steps.
    "user B's form checkoff with a browser Accept header redirects to the dashboard",
    () =>
      request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarB, headers: BROWSER_ACCEPT }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "a form checkoff by a member who never joined the task redirects with the forbidden error",
    () =>
      request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarC, headers: BROWSER_ACCEPT }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "user B's form uncheck with a browser Accept header redirects to the dashboard",
    () =>
      request("/api/tasks/uncheck", { method: "POST", form: { task_id: taskId }, jar: jarB, headers: BROWSER_ACCEPT }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "repeating the form uncheck is a quiet redirect",
    () =>
      request("/api/tasks/uncheck", { method: "POST", form: { task_id: taskId }, jar: jarB, headers: BROWSER_ACCEPT }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    // The JSON and form steps above left B enrolled with nothing ticked: B's own control and the board show that.
    "user B's dashboard offers Mark done with a streak of 0 and ranks everyone at position 1",
    async () => {
      const result = await request("/dashboard", { jar: jarB });
      // The control has to submit the real task id, or the tick and undo steps below would prove nothing.
      if (taskTargetInRow(result.body, renamedTaskTitle, "/api/tasks/checkoff") !== taskId) {
        console.log(
          "FAIL  the member's Mark done control does not carry the task id; later check-off steps cannot run",
        );
        process.exit(1);
      }
      return result;
    },
    B_NOTHING_TICKED,
  ],
  [
    // C is a member of the group but never joined the task: no control at all (the Join form proves the row rendered).
    "user C's dashboard shows the task without check-off controls",
    () => request("/dashboard", { jar: jarC }),
    {
      status: 200,
      bodyMatches: [
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
        leaderboardRow(email, 1, 0, { you: false }),
        leaderboardRow(emailB, 1, 0, { you: false }),
        leaderboardRow(emailC, 1, 0, { you: true }),
      ],
      bodyNotMatches: [
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/checkoff"),
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/uncheck"),
        taskRowStreak(renamedTaskTitle),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "a checkoff by a member who never joined the task is refused",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarC }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    "the board is unchanged after the refused checkoff",
    () => request("/dashboard", { jar: jarC }),
    {
      status: 200,
      bodyMatches: [
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
        leaderboardRow(email, 1, 0, { you: false }),
        leaderboardRow(emailB, 1, 0, { you: false }),
        leaderboardRow(emailC, 1, 0, { you: true }),
      ],
      bodyNotMatches: [
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/uncheck"),
        taskRowStreak(renamedTaskTitle),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "user B ticks the task",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "user B's dashboard shows Done today, Undo, a streak of 1 and B leading the board",
    async () => {
      const result = await request("/dashboard", { jar: jarB });
      // Without JavaScript the Undo form is the only way back, so it has to carry the real task id as well.
      if (taskTargetInRow(result.body, renamedTaskTitle, "/api/tasks/uncheck") !== taskId) {
        console.log("FAIL  the member's Undo control does not carry the task id; later undo steps would prove nothing");
        process.exit(1);
      }
      return result;
    },
    B_TICKED,
  ],
  [
    // Group-wide: A reads B's tick from the database after a reload, not from B's session. A's own row is still open.
    "owner dashboard shows user B's total and still offers Mark done on the owner's own row",
    () => request("/dashboard"),
    {
      status: 200,
      // The owner's Remove dialog warns that removing a member erases their streaks.
      bodyIncludes: "and their streaks in its tasks will be lost",
      bodyMatches: [
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/checkoff"),
        taskRowStreak(renamedTaskTitle, 0),
        leaderboardRow(emailB, 1, 1, { you: false }),
        leaderboardRow(email, 2, 0, { you: true }),
        leaderboardRow(emailC, 2, 0, { you: false }),
      ],
      bodyNotMatches: [
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/uncheck"),
        taskRowWithStatus(renamedTaskTitle, "Done today"),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "ticking the task again is a quiet redirect",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  ["the total stays 1 after the repeated tick", () => request("/dashboard", { jar: jarB }), B_TICKED],
  [
    "user B undoes the tick",
    () => request("/api/tasks/uncheck", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "user B's dashboard offers Mark done again and every total is back at 0",
    () => request("/dashboard", { jar: jarB }),
    B_NOTHING_TICKED,
  ],
  [
    "undoing again is a quiet redirect",
    () => request("/api/tasks/uncheck", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  ["the totals stay at 0 after the repeated undo", () => request("/dashboard", { jar: jarB }), B_NOTHING_TICKED],
  [
    // The tick that the cascade has to erase when B leaves the task below.
    "user B ticks the task again before leaving it",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  ["user B's dashboard shows the tick before leaving the task", () => request("/dashboard", { jar: jarB }), B_TICKED],
  [
    "task leave by a member succeeds",
    () => request("/api/tasks/leave", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "left member is gone from the task and offered to join again",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email),
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
        taskRowWithBadge(renamedTaskTitle, "Daily"),
      ],
      bodyNotMatches: [taskRowListing(renamedTaskTitle, emailB), taskRowWithConfirmedLeave(renamedTaskTitle)],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    // The tick went with the participation: B has neither a control nor a score on the board any more.
    "user B has no check-off control and no score after leaving the task",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
        leaderboardRow(email, 1, 0, { you: false }),
        leaderboardRow(emailB, 1, 0, { you: true }),
        leaderboardRow(emailC, 1, 0, { you: false }),
      ],
      bodyNotMatches: [
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/checkoff"),
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/uncheck"),
        taskRowStreak(renamedTaskTitle),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "creator dashboard no longer lists the member who left",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email, { you: true }),
        taskRowWithConfirmedDelete(renamedTaskTitle),
      ],
      bodyNotMatches: taskRowListing(renamedTaskTitle, emailB),
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "leaving a task that was not joined is a quiet redirect",
    () => request("/api/tasks/leave", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "task participation of the creator is intact after the member left",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [taskRowListing(renamedTaskTitle, email, { you: true })],
      bodyNotMatches: taskRowListing(renamedTaskTitle, emailB),
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    // The group-departure cleanup can only be checked once a task exists: the earlier leave/remove steps ran without one.
    "user B joins the task again before leaving the group",
    () => request("/api/tasks/join", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "user B is listed on the task before leaving the group",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, emailB, { you: true }),
        taskRowWithConfirmedLeave(renamedTaskTitle),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    // The leave above erased the tick: a fresh enrolment starts at 0, which proves the history went with the old one.
    "user B's rejoined task row offers Mark done with a streak of 0",
    () => request("/dashboard", { jar: jarB }),
    B_NOTHING_TICKED,
  ],
  [
    // The tick that the group-departure cleanup has to erase when B leaves the group below.
    "user B ticks the task again before leaving the group",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  ["user B's dashboard shows the tick before leaving the group", () => request("/dashboard", { jar: jarB }), B_TICKED],
  [
    "user B leaves the group while taking part in the task",
    () => request("/api/groups/leave", { method: "POST", jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "user B joins the group again with the invite code after taking part in the task",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "returning user B is not listed on the task until joining again",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        groupHeading(renamedGroupName),
        taskRowWithBadge(renamedTaskTitle, "Daily"),
        taskRowListing(renamedTaskTitle, email),
        taskRowWithForm(renamedTaskTitle, "/api/tasks/join"),
      ],
      bodyNotMatches: [taskRowListing(renamedTaskTitle, emailB), taskRowWithConfirmedLeave(renamedTaskTitle)],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "creator dashboard does not list user B after the group departure",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        taskRowListing(renamedTaskTitle, email, { you: true }),
        taskRowWithConfirmedDelete(renamedTaskTitle),
      ],
      bodyNotMatches: taskRowListing(renamedTaskTitle, emailB),
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "user B joins the task again after returning to the group",
    () => request("/api/tasks/join", { method: "POST", form: { task_id: taskId }, jar: jarB }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    // Leaving the group erased the tick the same way: B starts again at 0 and the board shows no score for B.
    "user B's task row offers Mark done with a streak of 0 after the group departure",
    () => request("/dashboard", { jar: jarB }),
    B_NOTHING_TICKED,
  ],
  [
    "task create of a once task by the creator succeeds",
    () => request("/api/tasks/create", { method: "POST", form: { title: onceTitle, recurrence: "once" } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "creator dashboard offers Mark done on the once task without a streak figure",
    async () => {
      const result = await request("/dashboard");
      onceTaskId = taskTargetInRow(result.body, onceTitle, "/api/tasks/checkoff");
      if (!onceTaskId) {
        console.log("FAIL  the once task's Mark done control carries no task id; later once-task steps cannot run");
        process.exit(1);
      }
      return result;
    },
    {
      status: 200,
      bodyMatches: [
        taskRowWithBadge(onceTitle, "Once"),
        taskRowWithCheckoffForm(onceTitle, "/api/tasks/checkoff"),
        // The daily task's row beside it still shows its streak, so the missing figure is not an empty page.
        taskRowStreak(renamedTaskTitle, 0),
        leaderboardRow(email, 1, 0, { you: true }),
        leaderboardRow(emailB, 1, 0, { you: false }),
        leaderboardRow(emailC, 1, 0, { you: false }),
      ],
      bodyNotMatches: [
        taskRowStreak(onceTitle),
        taskRowWithCheckoffForm(onceTitle, "/api/tasks/uncheck"),
        taskRowWithStatus(onceTitle, "Done"),
      ],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "creator ticks the once task",
    () => request("/api/tasks/checkoff", { method: "POST", form: { task_id: onceTaskId } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "creator dashboard shows the once task as Done and the creator's total raised by 1",
    async () => {
      const result = await request("/dashboard");
      if (taskTargetInRow(result.body, onceTitle, "/api/tasks/uncheck") !== onceTaskId) {
        console.log(
          "FAIL  the once task's Undo control does not carry the task id; later undo steps would prove nothing",
        );
        process.exit(1);
      }
      return result;
    },
    {
      status: 200,
      bodyMatches: [
        taskRowWithStatus(onceTitle, "Done"),
        taskRowWithCheckoffForm(onceTitle, "/api/tasks/uncheck"),
        leaderboardRow(email, 1, 1, { you: true }),
        leaderboardRow(emailB, 2, 0, { you: false }),
        leaderboardRow(emailC, 2, 0, { you: false }),
      ],
      bodyNotMatches: [taskRowWithCheckoffForm(onceTitle, "/api/tasks/checkoff"), taskRowStreak(onceTitle)],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "creator undoes the once task",
    () => request("/api/tasks/uncheck", { method: "POST", form: { task_id: onceTaskId } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "creator dashboard offers Mark done on the once task again and the total is back at 0",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        taskRowWithCheckoffForm(onceTitle, "/api/tasks/checkoff"),
        leaderboardRow(email, 1, 0, { you: true }),
        leaderboardRow(emailB, 1, 0, { you: false }),
        leaderboardRow(emailC, 1, 0, { you: false }),
      ],
      bodyNotMatches: [taskRowWithCheckoffForm(onceTitle, "/api/tasks/uncheck"), taskRowWithStatus(onceTitle, "Done")],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "task delete of the once task by the creator succeeds",
    () => request("/api/tasks/delete", { method: "POST", form: { task_id: onceTaskId } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "creator dashboard no longer lists the once task and keeps the daily one",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        taskRowWithBadge(renamedTaskTitle, "Daily"),
        taskRowWithCheckoffForm(renamedTaskTitle, "/api/tasks/checkoff"),
      ],
      bodyExcludes: [onceTitle, NO_ERROR_ALERT],
    },
  ],
  [
    "task delete by the creator succeeds",
    () => request("/api/tasks/delete", { method: "POST", form: { task_id: taskId } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "deleted task is gone from the member dashboard",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      // The Tasks card still renders (with its empty prompt), so the missing title is not an empty page.
      bodyIncludes: "No tasks yet",
      bodyMatches: TASKS_HEADING,
      bodyExcludes: [renamedTaskTitle, taskTitle, NO_ERROR_ALERT],
    },
  ],
  [
    "deleting the task again is a quiet redirect",
    () => request("/api/tasks/delete", { method: "POST", form: { task_id: taskId } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "delete by the owner succeeds",
    () => request("/api/groups/delete", { method: "POST" }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "owner dashboard shows the create form after deleting the group",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: ["Create a group", "Join a group"],
      bodyExcludes: ["Your group", renamedGroupName, "/join/", "Delete group", NO_ERROR_ALERT],
    },
  ],
  [
    "former member B sees the create form after the group was deleted",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: ["Create a group", "Join a group"],
      bodyNotMatches: TASKS_HEADING,
      bodyExcludes: ["Your group", renamedGroupName, "/join/", NO_ERROR_ALERT],
    },
  ],
  [
    "former member C sees the create form after the group was deleted",
    () => request("/dashboard", { jar: jarC }),
    {
      status: 200,
      bodyIncludes: ["Create a group", "Join a group"],
      bodyNotMatches: TASKS_HEADING,
      bodyExcludes: ["Your group", renamedGroupName, "/join/", NO_ERROR_ALERT],
    },
  ],
  [
    "the deleted group's invite code is no longer valid",
    () => request("/api/groups/join", { method: "POST", form: { code: joinCode }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=invalid_code" },
  ],
  [
    "deleting again after the group is gone is not an error",
    () => request("/api/groups/delete", { method: "POST" }),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "removing a member after the group is gone is not an error",
    () => request("/api/groups/remove-member", { method: "POST", form: { user_id: memberIdB } }),
    { status: 302, locationExact: "/dashboard" },
  ],
  ["signin page redirects signed-in user", () => request("/auth/signin"), { status: 302, location: "/dashboard" }],
  ["signup page redirects signed-in user", () => request("/auth/signup"), { status: 302, location: "/dashboard" }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expectation] of steps) {
  const actual = await run();
  // An expectation that depends on what only this run knows (the Warsaw day, a period an earlier step read) is given
  // as a function of the result, evaluated after the request.
  const expected = typeof expectation === "function" ? expectation(actual) : expectation;
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.locationExact === undefined || actual.location === expected.locationExact) &&
    (expected.setCookie === undefined || actual.setCookies.some((c) => c.includes(expected.setCookie))) &&
    (expected.header === undefined ||
      (actual.headers.get(expected.header.name) ?? "")
        .toLowerCase()
        .includes(expected.header.includes.toLowerCase())) &&
    [expected.bodyIncludes ?? []].flat().every((text) => actual.body.includes(text)) &&
    [expected.bodyMatches ?? []].flat().every((pattern) => pattern.test(actual.body)) &&
    [expected.bodyNotMatches ?? []].flat().every((pattern) => !pattern.test(actual.body)) &&
    [expected.bodyExcludes ?? []].flat().every((text) => !actual.body.includes(text));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(
      `      expected ${expected.status} ${expected.locationExact ?? expected.location ?? ""}` +
        (expected.setCookie ? ` Set-Cookie including "${expected.setCookie}"` : "") +
        (expected.header
          ? ` header ${expected.header.name} including "${expected.header.includes}" (got "${actual.headers.get(expected.header.name) ?? ""}")`
          : "") +
        (expected.bodyIncludes ? ` body includes ${JSON.stringify(expected.bodyIncludes)}` : "") +
        (expected.bodyMatches ? ` body matches ${[expected.bodyMatches].flat().join(" and ")}` : "") +
        (expected.bodyNotMatches ? ` body does not match ${[expected.bodyNotMatches].flat().join(" or ")}` : "") +
        (expected.bodyExcludes ? ` body excludes ${JSON.stringify(expected.bodyExcludes)}` : ""),
    );
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
