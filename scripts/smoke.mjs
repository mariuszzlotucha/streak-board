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
// A well-formed auth code that no flow state has: the real GoTrue answers it with a stale-flow error.
const UNKNOWN_FLOW_CODE = "11111111-1111-4111-8111-111111111111";
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

// The message inside the rendered alert. A `client:load` island repeats its props (the message too) in the HTML, so a
// plain substring check would also pass on a page whose alert does not render.
function alertMessage(text) {
  return new RegExp(`data-slot="alert-description"[^>]*>\\s*${escapeRegExp(text)}`);
}

// The message inside a rendered field error (`<p id="<field>-error" role="alert">`, an icon first). The island's
// serialized props repeat the text too, so this is the check that needs the element itself.
function fieldError(field, text) {
  return new RegExp(`id="${escapeRegExp(field)}-error"[^>]*>(?:<svg[\\s\\S]*?</svg>)?\\s*${escapeRegExp(text)}`);
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

// The add-task form posts a native `recurrence` select with `once` preselected; without the field every add would end
// in `?error=invalid_recurrence`.
const RECURRENCE_FIELD =
  /<form[^>]*action="\/api\/tasks\/create"[^>]*>(?:(?!<\/form>)[\s\S])*<select[^>]*name="recurrence"[^>]*>(?:(?!<\/select>)[\s\S])*<option[^>]*value="once"[^>]*selected/;

// An <a> element whose href is exactly `href` (the closing quote rules out a longer path with the same start).
function linkTo(href) {
  return new RegExp(`<a\\s[^>]*href="${escapeRegExp(href)}"`);
}

// The header's brand link: an <a href="/"> whose own content holds the name (the <title> or a bare link would not match).
const BRAND_LINK = /<a\s[^>]*href="\/"[^>]*>(?:(?!<\/a>)[\s\S])*StreakBoard(?:(?!<\/a>)[\s\S])*<\/a>/;

// The headings of the landing page and the privacy policy (an error page or another page would not match).
const LANDING_HEADING = /<h1[^>]*>\s*Keep each other on track\.\s*<\/h1>/;
const PRIVACY_HEADING = /<h1[^>]*>\s*Privacy Policy\s*<\/h1>/;

// A mailto: link to a configured contact address (CONTACT_EMAIL is runtime configuration, so smoke pins its shape only;
// the "not configured" notice or an obfuscated /cdn-cgi/ link would not match).
const CONTACT_LINK = /<a\s[^>]*href="mailto:[^"@\s]+@[^"@\s]+\.[^"@\s]+"/;

// The Set-Cookie headers whose cookie name starts with `prefix`, as names and whether each carries `Secure`. Only the
// names are ever printed: a value may be a session or a code verifier.
function cookiesNamed(setCookies, prefix) {
  return setCookies
    .map((raw) => {
      const [pair, ...attrs] = raw.split(";");
      return { name: pair.split("=")[0].trim(), secure: attrs.some((attr) => /^secure$/i.test(attr.trim())) };
    })
    .filter(({ name }) => name.startsWith(prefix));
}

// At least one such cookie is set, and every one of them is HTTPS-only.
function allSecure(setCookies, prefix) {
  const cookies = cookiesNamed(setCookies, prefix);
  return cookies.length > 0 && cookies.every(({ secure }) => secure);
}

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

// The page's <h1> holding exactly `text` (a card title or an alert with the same words would not match).
function pageHeading(text) {
  return new RegExp(`<h1[^>]*>\\s*${escapeRegExp(text)}\\s*</h1>`);
}

// The quiet account line of the signed-in shell: the label and the address in one element right after it.
function signedInAs(address) {
  return new RegExp(`Signed in as\\s*<span[^>]*>\\s*${escapeRegExp(address)}\\s*</span>`);
}

// The header's Sign out: a plain form posting to the sign-out route with its submit button. Two "Sign out" anywhere
// on the page fail the second pattern, so the button exists exactly once.
const SIGN_OUT_FORM =
  /<form[^>]*action="\/api\/auth\/signout"[^>]*>(?:(?!<\/form>)[\s\S])*<button[^>]*type="submit"[^>]*>\s*Sign out\s*<\/button>/;
const TWO_SIGN_OUTS = /Sign out[\s\S]*Sign out/;

// The sole member's invite sentence. Astro may write the apostrophe as an entity.
const SOLE_MEMBER_INVITE =
  /You(?:'|&#39;|&#x27;)re the only member so far\. Share this invite link so others can join\./;

// The invite input sits in the Members card, the last card of the page: after its heading, with no other card heading
// between it and the end of <main>.
const INVITE_IN_MEMBERS =
  /<h2[^>]*>\s*Members\s*<\/h2>(?:(?!<h2)[\s\S])*aria-label="Invite link"(?:(?!<h2|<\/main>)[\s\S])*<\/main>/;

// The in-group page in the main-loop order: Tasks, the Leaderboard, then Members.
const IN_GROUP_ORDER = /<h2[^>]*>\s*Tasks\s*<\/h2>[\s\S]*aria-label="Leaderboard"[\s\S]*<h2[^>]*>\s*Members\s*<\/h2>/;

// Group management lives on /settings: none of its texts may be on the dashboard (the dialogs' island props included).
const SETTINGS_ON_DASHBOARD = ["Group settings", "Rename group", "Delete group", "Leave group"];

// The Main nav of the signed-in header: the current page's link carries aria-current="page" and the other one does not.
function mainNav(current) {
  const other = current === "/dashboard" ? "/settings" : "/dashboard";
  return [
    new RegExp(
      `<nav[^>]*aria-label="Main"[^>]*>(?:(?!</nav>)[\\s\\S])*<a[^>]*href="${current}"[^>]*aria-current="page"[^>]*>\\s*${current === "/dashboard" ? "Dashboard" : "Settings"}\\s*</a>`,
    ),
    new RegExp(`<nav[^>]*aria-label="Main"[^>]*>(?:(?!</nav>)[\\s\\S])*<a(?![^>]*aria-current)[^>]*href="${other}"`),
  ];
}

// The settings page's card heading, and a link to the dashboard inside <main> (the Main nav's link is in the header).
const GROUP_SETTINGS_HEADING = /<h2[^>]*>\s*Group settings\s*<\/h2>/;
// The settings card of the named group: its heading, then the group name as the card's description.
function groupSettingsFor(name) {
  return new RegExp(
    `<h2[^>]*>\\s*Group settings\\s*</h2>\\s*<div[^>]*data-slot="card-description"[^>]*>\\s*${escapeRegExp(name)}\\s*</div>`,
  );
}
const DASHBOARD_LINK_IN_MAIN = /<main[^>]*>(?:(?!<\/main>)[\s\S])*<a\s[^>]*href="\/dashboard"/;
// Every group form; the no-group settings page has none of them.
const GROUP_FORMS = ["create", "join", "rename", "delete", "leave"].map((action) =>
  formPostingTo(`/api/groups/${action}`),
);

// The "Your group" eyebrow directly above the group's <h1>.
function eyebrowAndGroupHeading(name) {
  return new RegExp(`>\\s*Your group\\s*</p>\\s*<h1[^>]*>\\s*${escapeRegExp(name)}\\s*</h1>`);
}

// The pending invite's form: it posts to the join route with the invite's code in a hidden field and holds the page's
// "Join group" button.
function pendingInviteForm(code) {
  return new RegExp(
    `<form[^>]*action="/api/groups/join"[^>]*>(?:(?!</form>)[\\s\\S])*<input[^>]*name="code"[^>]*value="${escapeRegExp(code)}"(?:(?!</form>)[\\s\\S])*<button[^>]*>\\s*Join group\\s*</button>`,
  );
}
const TWO_JOIN_GROUPS = /Join group[\s\S]*Join group/;

// The action error comes first in the page content: inside <main>, before any <h1>, then the group's <h1> after it.
function alertBeforeHeading(text, name) {
  return new RegExp(
    `<main[^>]*>(?:(?!<h1|</main>)[\\s\\S])*data-slot="alert-description"[^>]*>\\s*${escapeRegExp(text)}(?:(?!</main>)[\\s\\S])*<h1[^>]*>\\s*${escapeRegExp(name)}\\s*</h1>`,
  );
}

// The text anywhere in the page's markup, that is, not inside a <script> element: an alert, a heading or an island's
// serialised props would match, the inlined island runtime would not.
function outsideScripts(text) {
  return new RegExp(`(?<!<script\\b[^>]*>(?:(?!</script>)[\\s\\S])*)${escapeRegExp(text)}`);
}

// The inline script that drops `?error=` from the address after the page has shown the alert.
const ERROR_PARAM_SCRIPT =
  /<script[^>]*>(?:(?!<\/script>)[\s\S])*searchParams\.delete\("error"\)(?:(?!<\/script>)[\s\S])*history\.replaceState/;

// B's dashboard while B takes part in the daily task and nothing is ticked: the row offers the tick with a streak of 0
// and A, B and C all share position 1 with a total of 0. B's task Leave dialog (island props in the server HTML) warns
// that leaving erases the streak; the group Leave dialog's warning is on /settings.
const B_NOTHING_TICKED = {
  status: 200,
  bodyIncludes: "and your streak on it will be lost",
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

// The build mode decides whether the Secure check applies: `/dev/signin-kitchen-sink` answers 404 in a production build
// and renders in dev. Any other answer stops the run, so the check is never skipped or applied by mistake.
async function probeProductionBuild() {
  const { status } = await request("/dev/signin-kitchen-sink", { cookie: "" });
  if (status === 404) return true;
  if (status === 200) return false;
  console.log(
    `FAIL  build-mode probe: expected 404 (production build) or 200 (dev) from /dev/signin-kitchen-sink, got ${status}`,
  );
  process.exit(1);
}

const PRODUCTION_BUILD = await probeProductionBuild();
console.log(
  `INFO  ${PRODUCTION_BUILD ? "production build: sb- cookies must carry Secure" : "dev server: no Secure check"}`,
);

const steps = [
  [
    "home renders",
    () => request("/"),
    {
      status: 200,
      bodyMatches: [LANDING_HEADING, BRAND_LINK, linkTo("/auth/signup"), linkTo("/auth/signin"), linkTo("/privacy")],
    },
  ],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["settings redirects anonymous user", () => request("/settings"), { status: 302, locationExact: "/auth/signin" }],
  [
    "signin page renders for anonymous user",
    () => request("/auth/signin"),
    { status: 200, bodyMatches: [BRAND_LINK, linkTo("/privacy")] },
  ],
  [
    "signup page renders for anonymous user",
    () => request("/auth/signup"),
    { status: 200, bodyIncludes: "will see your e-mail address", bodyMatches: [BRAND_LINK, linkTo("/privacy")] },
  ],
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
  // The Google flow without Google: only the app's own side can be asserted here (the provider is off on the local
  // stack and no step leaves the app). Every request uses `cookie` so user A's jar is never touched.
  [
    // The server-side call only builds the Supabase URL, so this holds with the provider disabled. The verifier cookie
    // has to be on this same response, or the return could never be exchanged.
    "google start redirects to the Supabase authorize URL with a challenge and sets the verifier cookie",
    () => request("/api/auth/google", { method: "POST", form: {}, cookie: "" }),
    {
      status: 302,
      locationIncludes: [
        "/auth/v1/authorize?provider=google",
        `redirect_to=${encodeURIComponent(`${BASE_URL}/auth/google/callback`)}`,
        "code_challenge=",
      ],
      setCookie: "-code-verifier=",
      ...(PRODUCTION_BUILD ? { secureCookies: "sb-" } : {}),
    },
  ],
  [
    // The same-origin start above answers 302, so a 403 here can only come from the Origin check.
    "google start from a foreign origin is rejected",
    () => request("/api/auth/google", { method: "POST", form: {}, cookie: "", origin: FOREIGN_ORIGIN }),
    { status: 403, setCookieExcludes: "-code-verifier" },
  ],
  [
    // Safe methods skip the Origin check, so a GET handler would let any site start a sign-in for the visitor.
    "google start does not answer GET",
    () => request("/api/auth/google", { cookie: "" }),
    { status: 404 },
  ],
  // The password routes are POST-only as well: a GET handler on sign-in or sign-up would take credentials from a
  // query string, and one on sign-out would let any site end the visitor's session through a cross-site top-level GET.
  ["signin does not answer GET", () => request("/api/auth/signin", { cookie: "" }), { status: 404 }],
  ["signup does not answer GET", () => request("/api/auth/signup", { cookie: "" }), { status: 404 }],
  ["signout does not answer GET", () => request("/api/auth/signout", { cookie: "" }), { status: 404 }],
  [
    // An anonymous jar has no session to end, so nothing is lost even if the Origin check were off. The pending invite
    // cookie is the handler's one side effect for such a visitor (sign-out clears `join_code`): no Set-Cookie for it
    // proves the handler never ran, not only that the answer was 403.
    "signout from a foreign origin is rejected",
    () =>
      request("/api/auth/signout", { method: "POST", form: {}, cookie: "join_code=0123abcd", origin: FOREIGN_ORIGIN }),
    { status: 403, setCookieExcludes: ["join_code", "sb-"] },
  ],
  [
    // The Google round trip must not lose a pending invite: the start route neither sets nor clears `join_code`. The
    // redirect and the verifier cookie prove the request went through the whole route, so the missing cookie is not an
    // artefact of an early exit.
    "google start leaves the join_code cookie alone",
    () => request("/api/auth/google", { method: "POST", form: {}, cookie: "join_code=0123abcd" }),
    {
      status: 302,
      locationIncludes: "/auth/v1/authorize?provider=google",
      setCookie: "-code-verifier=",
      setCookieExcludes: "join_code",
    },
  ],
  [
    "google return without parameters ends on signin with oauth_failed",
    () => request("/auth/google/callback", { cookie: "" }),
    { status: 302, locationExact: "/auth/signin?error=oauth_failed" },
  ],
  [
    // A code without the verifier cookie reaches the real exchange, where the SDK itself refuses before any request.
    "google return with a code but no verifier cookie ends on signin with oauth_failed",
    () => request("/auth/google/callback?code=not-a-real-code", { cookie: "" }),
    { status: 302, locationExact: "/auth/signin?error=oauth_failed" },
  ],
  [
    // The verifier cookies come from a real start and the code is well formed but unknown, so the stack's own GoTrue
    // answers: that answer has to map to oauth_failed and not to a fault. Without verifier cookies the start answer is
    // returned instead, which cannot match the expected Location.
    "google return with the verifier cookie and an unknown code ends on signin with oauth_failed",
    async () => {
      const started = await request("/api/auth/google", { method: "POST", form: {}, cookie: "" });
      const cookie = started.setCookies.map((c) => c.split(";")[0]).join("; ");
      if (!cookie.includes("-code-verifier=")) return started;
      return request(`/auth/google/callback?code=${UNKNOWN_FLOW_CODE}`, { cookie });
    },
    { status: 302, locationExact: "/auth/signin?error=oauth_failed" },
  ],
  [
    "google return after a cancelled consent ends on signin with oauth_cancelled",
    () => request("/auth/google/callback?error=access_denied&error_description=", { cookie: "" }),
    { status: 302, locationExact: "/auth/signin?error=oauth_cancelled" },
  ],
  [
    // `error_code` marks a refusal after Supabase loaded the state, which is not a user's cancellation.
    "google return after a refusal with an error_code ends on signin with unknown",
    () => request("/auth/google/callback?error=access_denied&error_code=signup_disabled", { cookie: "" }),
    { status: 302, locationExact: "/auth/signin?error=unknown" },
  ],
  // Supabase answers an expired, unknown or used flow state on the Site URL root, where nothing else would show it.
  ...["bad_oauth_state", "bad_oauth_callback", "flow_state_already_used"].map((errorCode) => [
    `home with error_code=${errorCode} ends on signin with oauth_failed`,
    () => request(`/?error_code=${errorCode}`, { cookie: "" }),
    { status: 302, locationExact: "/auth/signin?error=oauth_failed" },
  ]),
  [
    // Only the three flow-state codes redirect; the landing page keeps answering for any other query.
    "home with an unrelated error_code still renders",
    () => request("/?error_code=something_else", { cookie: "" }),
    { status: 200, bodyMatches: [LANDING_HEADING] },
  ],
  [
    "home without a query still renders",
    () => request("/", { cookie: "" }),
    { status: 200, bodyMatches: [LANDING_HEADING] },
  ],
  [
    "privacy page renders the policy",
    () => request("/privacy", { cookie: "" }),
    {
      status: 200,
      bodyMatches: [PRIVACY_HEADING, BRAND_LINK, CONTACT_LINK],
      bodyIncludes: ["Mariusz Złotucha", "Prezes Urzędu Ochrony Danych Osobowych"],
    },
  ],
  [
    "confirm-email page shows the brand and the policy link",
    () => request("/auth/confirm-email", { cookie: "" }),
    { status: 200, bodyMatches: [BRAND_LINK, linkTo("/privacy"), linkTo("/auth/signin")] },
  ],
  ["starter banner is not served", () => request("/template.png", { cookie: "" }), { status: 404 }],
  [
    `dashboard kitchen sink ${PRODUCTION_BUILD ? "is closed in a production build" : "renders fixture data in dev"}`,
    () => request("/dev/dashboard-kitchen-sink?state=owner", { cookie: "" }),
    // A state page renders fixture data with `@example.test` e-mails in dev (the positive control that shows the body
    // check can fail); a production build answers 404 with neither the fixtures nor the gallery's title.
    PRODUCTION_BUILD
      ? { status: 404, bodyExcludes: ["@example.test", "Dashboard kitchen sink"] }
      : { status: 200, bodyIncludes: "@example.test" },
  ],
  ["brand favicon is served", () => request("/favicon.svg", { cookie: "" }), { status: 200, bodyIncludes: "<svg" }],
  [
    "signin page shows the cancelled message",
    () => request("/auth/signin?error=oauth_cancelled", { cookie: "" }),
    { status: 200, bodyMatches: [alertMessage("Google sign-in was cancelled")] },
  ],
  [
    "signin page shows the failed message",
    () => request("/auth/signin?error=oauth_failed", { cookie: "" }),
    { status: 200, bodyMatches: [alertMessage("Google sign-in could not be completed")] },
  ],
  [
    "signin page does not reflect a foreign error",
    () => request("/auth/signin?error=Injected%20message", { cookie: "" }),
    { status: 200, bodyExcludes: "Injected message" },
  ],
  [
    // The button also says "Continue with Google", so only the hint's own wording proves the message changed.
    "signin page adds the Google hint to the invalid-credentials message",
    () => request("/auth/signin?error=invalid_credentials", { cookie: "" }),
    { status: 200, bodyMatches: [alertMessage("Invalid email or password. If you signed up with Google")] },
  ],
  [
    "signup page adds the Google hint to the duplicate-email message",
    () => request("/auth/signup?error=email_taken", { cookie: "" }),
    {
      status: 200,
      bodyMatches: [fieldError("email", "An account with this email already exists. Sign in instead, or use Continue")],
    },
  ],
  [
    "signin page offers Continue with Google through a form posting to the start route",
    () => request("/auth/signin", { cookie: "" }),
    { status: 200, bodyIncludes: "Continue with Google", bodyMatches: [formPostingTo("/api/auth/google")] },
  ],
  [
    "signup page offers Continue with Google through a form posting to the start route",
    () => request("/auth/signup", { cookie: "" }),
    { status: 200, bodyIncludes: "Continue with Google", bodyMatches: [formPostingTo("/api/auth/google")] },
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
    // The address is registered already, so no account could be created even if the Origin check were off (the step
    // above answers 302 email_taken and remembers the address): a 403 without the `auth_email` cookie can only come
    // from the Origin check, before the handler ran.
    "signup from a foreign origin is rejected",
    () => request("/api/auth/signup", { method: "POST", form: { email, password }, origin: FOREIGN_ORIGIN }),
    { status: 403, setCookieExcludes: "auth_email=" },
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
    // The wrong password cannot open a session even if the Origin check were off (the step above answers 302
    // invalid_credentials and remembers the address): a 403 without the `auth_email` cookie can only come from the
    // Origin check, before the handler ran.
    "signin from a foreign origin is rejected",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" }, origin: FOREIGN_ORIGIN }),
    { status: 403, setCookieExcludes: ["auth_email=", "sb-"] },
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
    // A production build serves the session over HTTPS only; the dev server and this script's jar ignore the flag.
    { status: 302, location: "/dashboard", ...(PRODUCTION_BUILD ? { secureCookies: "sb-" } : {}) },
  ],
  [
    // User A has no group yet: the signed-in shell around the no-group page.
    "dashboard renders for signed-in user",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        BRAND_LINK,
        /<main[\s>]/,
        SIGN_OUT_FORM,
        signedInAs(email),
        pageHeading("Start or join a group"),
        linkTo("/privacy"),
        ...mainNav("/dashboard"),
      ],
      bodyNotMatches: [TWO_SIGN_OUTS],
      // The join-by-code form says so; "Join group" is the pending invite's button only.
      bodyIncludes: "Join with code",
      bodyExcludes: ["Join group", NO_ERROR_ALERT],
    },
  ],
  [
    // Without a group, settings has nothing to manage: it points to the dashboard, where groups are created and joined.
    "settings without a group links to the dashboard and offers no group forms",
    () => request("/settings"),
    {
      status: 200,
      bodyMatches: [pageHeading("Settings"), DASHBOARD_LINK_IN_MAIN, SIGN_OUT_FORM, ...mainNav("/settings")],
      bodyNotMatches: [GROUP_SETTINGS_HEADING, TWO_SIGN_OUTS, ...GROUP_FORMS],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  ["home redirects signed-in user to dashboard", () => request("/"), { status: 302, locationExact: "/dashboard" }],
  [
    // The signed-in check runs before the flow-state check, so a second click on "Continue with Google" lands directly.
    "home with a flow-state error_code redirects signed-in user to dashboard",
    () => request("/?error_code=flow_state_already_used"),
    { status: 302, locationExact: "/dashboard" },
  ],
  [
    "privacy page stays public for signed-in user",
    () => request("/privacy"),
    { status: 200, bodyMatches: [PRIVACY_HEADING] },
  ],
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
  ["task create does not answer GET", () => request("/api/tasks/create"), { status: 404 }],
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
    {
      status: 200,
      bodyIncludes: [groupName, "/join/"],
      // Alone in the new group, the owner is told the invite is the next step, in the Members card. Group management
      // is on /settings, not here.
      bodyMatches: [groupHeading(groupName), SOLE_MEMBER_INVITE, INVITE_IN_MEMBERS],
      bodyExcludes: [...SETTINGS_ON_DASHBOARD, NO_ERROR_ALERT],
    },
  ],
  [
    "settings offers the owner rename and delete, and no leave",
    () => request("/settings"),
    {
      status: 200,
      bodyMatches: [
        groupSettingsFor(groupName),
        // The rename form itself (posting the `name` field), then the delete control through its dialog.
        formPostingTo("/api/groups/rename"),
        /<input[^>]*name="name"/,
        formPostingTo("/api/groups/delete"),
        dialogTrigger("Delete group"),
        ...mainNav("/settings"),
      ],
      bodyNotMatches: [formPostingTo("/api/groups/leave"), SUBMIT_IN_DESTRUCTIVE_FORM],
      bodyExcludes: ["Leave group", NO_ERROR_ALERT],
    },
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
    // An empty form joins nothing even if the Origin check were off (it would answer 302 invalid_code), but it would
    // clear B's pending invite cookie: no Set-Cookie for `join_code` proves the handler never ran. The preview step
    // below reads the state: B is still outside the group and the invite is still pending.
    "join from a foreign origin is rejected",
    () => request("/api/groups/join", { method: "POST", form: {}, jar: jarB, origin: FOREIGN_ORIGIN }),
    { status: 403, setCookieExcludes: "join_code" },
  ],
  [
    "dashboard previews the pending invite for user B",
    () => request("/dashboard", { jar: jarB }),
    // The invite is the page's one decision: its <h1>, and the only "Join group" in a form carrying the invite's code
    // (the name alone would also appear next to an error). Create and join-by-code sit below under their own heading;
    // a non-member must not see the invite link. A function, so the code read by an earlier step is used.
    () => ({
      status: 200,
      bodyMatches: [
        pageHeading(`Join ${groupName}?`),
        pendingInviteForm(joinCode),
        /<h2[^>]*>\s*Or start your own group\s*<\/h2>/,
      ],
      bodyNotMatches: [TWO_JOIN_GROUPS],
      bodyIncludes: "Join with code",
      bodyExcludes: ["/join/", NO_ERROR_ALERT],
    }),
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
      bodyMatches: [memberRow(email, "Owner"), memberRow(emailB, "You"), groupHeading(groupName)],
      // The markers sit on the right rows only, and with two members the owner is no longer told they are alone.
      // Leaving the group is on /settings.
      bodyNotMatches: [
        memberRow(email, "You"),
        memberRow(emailB, "Owner"),
        SOLE_MEMBER_INVITE,
        formPostingTo("/api/groups/leave"),
      ],
      bodyExcludes: [...SETTINGS_ON_DASHBOARD, NO_ERROR_ALERT],
    },
  ],
  [
    // A member manages only their own membership: the leave control through its dialog, which warns about the streaks.
    "settings offers member B leave, with the streak warning, and no owner controls",
    () => request("/settings", { jar: jarB }),
    {
      status: 200,
      bodyIncludes: "and your streaks in its tasks will be lost",
      bodyMatches: [
        groupSettingsFor(groupName),
        formPostingTo("/api/groups/leave"),
        dialogTrigger("Leave group"),
        ...mainNav("/settings"),
      ],
      bodyNotMatches: [formPostingTo("/api/groups/rename"), formPostingTo("/api/groups/delete")],
      bodyExcludes: ["Rename group", "Delete group", NO_ERROR_ALERT],
    },
  ],
  [
    "rename by a non-owner is rejected",
    () => request("/api/groups/rename", { method: "POST", form: { name: renamedGroupName }, jar: jarB }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // The owner's own session, but an empty name: nothing would change even if the Origin check were off (it would
    // answer 302 invalid_name). The step below reads the state: the group still carries its first name.
    "rename from a foreign origin is rejected",
    () => request("/api/groups/rename", { method: "POST", form: { name: "  " }, origin: FOREIGN_ORIGIN }),
    { status: 403 },
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
      bodyMatches: [groupHeading(renamedGroupName), memberRow(email, "Owner"), memberRow(email, "You")],
      // B is neither the owner nor the current user.
      bodyNotMatches: [memberRow(emailB, "You"), memberRow(emailB, "Owner")],
      bodyExcludes: [groupName, ...SETTINGS_ON_DASHBOARD, NO_ERROR_ALERT],
    },
  ],
  [
    "settings shows the owner the new name with rename and delete, and no leave",
    () => request("/settings"),
    {
      status: 200,
      bodyMatches: [
        groupSettingsFor(renamedGroupName),
        formPostingTo("/api/groups/rename"),
        /<input[^>]*name="name"/,
        formPostingTo("/api/groups/delete"),
        dialogTrigger("Delete group"),
      ],
      bodyNotMatches: [formPostingTo("/api/groups/leave")],
      bodyExcludes: [groupName, "Leave group", NO_ERROR_ALERT],
    },
  ],
  [
    "leave by the owner is rejected",
    () => request("/api/groups/leave", { method: "POST" }),
    { status: 302, locationExact: "/dashboard?error=forbidden" },
  ],
  [
    // The owner's own session: the database refuses the owner's leave anyway (the step above answers 302 forbidden),
    // so the membership stays even if the Origin check were off. The step below reads the state.
    "leave from a foreign origin is rejected",
    () => request("/api/groups/leave", { method: "POST", form: {}, origin: FOREIGN_ORIGIN }),
    { status: 403 },
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
      ],
      // Deleting the group is on /settings.
      bodyNotMatches: [rowWithRemoveControl(email), SUBMIT_IN_DESTRUCTIVE_FORM, formPostingTo("/api/groups/delete")],
      bodyExcludes: [...SETTINGS_ON_DASHBOARD, NO_ERROR_ALERT],
    },
  ],
  [
    "settings offers the owner of three members the delete control through its dialog",
    () => request("/settings"),
    {
      status: 200,
      bodyMatches: [
        groupSettingsFor(renamedGroupName),
        formPostingTo("/api/groups/delete"),
        dialogTrigger("Delete group"),
      ],
      bodyNotMatches: [SUBMIT_IN_DESTRUCTIVE_FORM, formPostingTo("/api/groups/leave")],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    "member dashboard offers no remove or delete controls",
    () => request("/dashboard", { jar: jarB }),
    {
      status: 200,
      // B's own member row proves the member view rendered; the owner-only forms must be absent, not just unlabelled.
      bodyMatches: [groupHeading(renamedGroupName), memberRow(emailB, "You")],
      bodyNotMatches: [formPostingTo("/api/groups/remove-member"), formPostingTo("/api/groups/delete")],
      bodyExcludes: [...SETTINGS_ON_DASHBOARD, NO_ERROR_ALERT],
    },
  ],
  [
    "member settings offers leave and no delete control",
    () => request("/settings", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        groupSettingsFor(renamedGroupName),
        formPostingTo("/api/groups/leave"),
        dialogTrigger("Leave group"),
      ],
      bodyNotMatches: [formPostingTo("/api/groups/delete"), formPostingTo("/api/groups/remove-member")],
      bodyExcludes: ["Delete group", NO_ERROR_ALERT],
    },
  ],
  [
    // A rejected action lands here: its message is the first thing in the page content, and the page carries the
    // script that drops the code from the address so a reload does not repeat it.
    "member dashboard with ?error=forbidden shows the alert first and drops the code from the address",
    () => request("/dashboard?error=forbidden", { jar: jarB }),
    {
      status: 200,
      bodyMatches: [
        alertBeforeHeading("You are not allowed to do that.", renamedGroupName),
        ERROR_PARAM_SCRIPT,
        // The member view itself rendered under the alert.
        memberRow(emailB, "You"),
      ],
    },
  ],
  // A foreign `?error=` value is never reflected: the page renders without any alert and without the value in its
  // markup. The two values differ in kind: a prototype key tests the lookup in the message table, a made-up code the
  // plain miss. The step above is the positive control (a known code does render the alert). Astro's island runtime,
  // inlined in a <script>, names `__proto__` as a key it refuses to deserialize, so the check leaves scripts out and a
  // plain substring check would never pass for that value.
  ...["__proto__", "not-a-code"].map((value) => [
    `member dashboard with ?error=${value} shows no alert and does not reflect the value`,
    () => request(`/dashboard?error=${value}`, { jar: jarB }),
    {
      status: 200,
      bodyMatches: [groupHeading(renamedGroupName), memberRow(emailB, "You")],
      bodyNotMatches: outsideScripts(value),
      bodyExcludes: NO_ERROR_ALERT,
    },
  ]),
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
  // The other group routes are POST-only too: a GET handler on create, join, rename or leave would let a link change
  // the visitor's membership or group name.
  ["group create does not answer GET", () => request("/api/groups/create", { jar: jarB }), { status: 404 }],
  ["join does not answer GET", () => request("/api/groups/join", { jar: jarB }), { status: 404 }],
  ["rename does not answer GET", () => request("/api/groups/rename", { jar: jarB }), { status: 404 }],
  ["leave does not answer GET", () => request("/api/groups/leave", { jar: jarB }), { status: 404 }],
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
        RECURRENCE_FIELD,
        // The creator is enrolled at task insert, so the fresh row already lists them, marked as the viewer.
        taskRowListing(taskTitle, email, { you: true }),
      ],
      bodyNotMatches: [SUBMIT_IN_DESTRUCTIVE_FORM, taskRowListing(taskTitle, emailB)],
      bodyExcludes: NO_ERROR_ALERT,
    },
  ],
  [
    // With a task, every card of the owner's page renders: the main loop (Tasks, then the Leaderboard) comes before
    // Members, under the group's own heading; group settings are on their own page.
    "owner dashboard with a task orders the cards by the main loop",
    () => request("/dashboard"),
    {
      status: 200,
      bodyMatches: [
        IN_GROUP_ORDER,
        eyebrowAndGroupHeading(renamedGroupName),
        INVITE_IN_MEMBERS,
        ...mainNav("/dashboard"),
      ],
      bodyNotMatches: [SOLE_MEMBER_INVITE],
      bodyExcludes: [...SETTINGS_ON_DASHBOARD, NO_ERROR_ALERT],
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
    // The group is gone, so settings falls back to the no-group state with no group controls left.
    "owner settings show the no-group state after deleting the group",
    () => request("/settings"),
    {
      status: 200,
      bodyMatches: [pageHeading("Settings"), DASHBOARD_LINK_IN_MAIN],
      bodyNotMatches: [GROUP_SETTINGS_HEADING, ...GROUP_FORMS],
      bodyExcludes: [renamedGroupName, "Delete group", NO_ERROR_ALERT],
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
    [expected.locationIncludes ?? []].flat().every((text) => actual.location.includes(text)) &&
    (expected.setCookie === undefined || actual.setCookies.some((c) => c.includes(expected.setCookie))) &&
    [expected.setCookieExcludes ?? []].flat().every((text) => !actual.setCookies.some((c) => c.includes(text))) &&
    (expected.secureCookies === undefined || allSecure(actual.setCookies, expected.secureCookies)) &&
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
        (expected.locationIncludes ? ` Location including ${JSON.stringify(expected.locationIncludes)}` : "") +
        (expected.setCookie ? ` Set-Cookie including "${expected.setCookie}"` : "") +
        // Only the cookie names are printed: a value may be a session or a code verifier.
        (expected.setCookieExcludes
          ? ` no Set-Cookie including ${JSON.stringify(expected.setCookieExcludes)} (got names ${JSON.stringify(actual.setCookies.map((c) => c.split("=")[0]))})`
          : "") +
        (expected.secureCookies
          ? ` at least one ${expected.secureCookies}* Set-Cookie, every one with Secure (got ${JSON.stringify(cookiesNamed(actual.setCookies, expected.secureCookies).map(({ name, secure }) => `${name}${secure ? " Secure" : " without Secure"}`))})`
          : "") +
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
