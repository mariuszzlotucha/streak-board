// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const stamp = Date.now();
const email = `smoke-${stamp}@example.com`;
const emailB = `smoke-b-${stamp}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const groupName = `Smoke Group ${stamp}`;
// Deliberately not containing groupName, so "the old name is gone" can be asserted with a plain substring check.
const renamedGroupName = `Renamed Crew ${stamp}`;
// User A's session and user B's session are independent cookie jars.
const jarA = new Map();
const jarB = new Map();
// Read from A's dashboard at run time and used by the later invite steps.
let joinCode;

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
async function request(path, { method = "GET", form, cookie, jar = jarA, origin = BASE_URL } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookie ?? cookieHeader(jar),
      Origin: origin,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  if (cookie === undefined) storeCookies(response, jar);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    setCookies: response.headers.getSetCookie(),
    body: await response.text(),
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The group name inside the group card's heading (an error alert or the join card would not match).
function groupHeading(name) {
  return new RegExp(`<h1[^>]*>\\s*${escapeRegExp(name)}\\s*</h1>`);
}

// A member row (<li>) that contains the given email followed by the given marker badge.
function memberRow(memberEmail, marker) {
  return new RegExp(
    `<li[^>]*>(?:(?!</li>)[\\s\\S])*${escapeRegExp(memberEmail)}(?:(?!</li>)[\\s\\S])*>\\s*${marker}\\s*<`,
  );
}

// The form the component rendered posts to `route` (the card heading and the serialised island props would not match).
function formPostingTo(route) {
  return new RegExp(`<form[^>]*action="${escapeRegExp(route)}"`);
}

const NO_ERROR_ALERT = 'role="alert"';
// Only the rendered read-only input carries this label; the invite URL also sits in the island's serialised props.
const INVITE_INPUT = 'aria-label="Invite link"';

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
    () => request("/api/groups/create", { method: "POST", form: { name: "  " }, origin: "http://evil.example" }),
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
  ["signin page redirects signed-in user", () => request("/auth/signin"), { status: 302, location: "/dashboard" }],
  ["signup page redirects signed-in user", () => request("/auth/signup"), { status: 302, location: "/dashboard" }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.locationExact === undefined || actual.location === expected.locationExact) &&
    (expected.setCookie === undefined || actual.setCookies.some((c) => c.includes(expected.setCookie))) &&
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
        (expected.bodyIncludes ? ` body includes ${JSON.stringify(expected.bodyIncludes)}` : "") +
        (expected.bodyMatches ? ` body matches ${expected.bodyMatches.join(" and ")}` : "") +
        (expected.bodyNotMatches ? ` body does not match ${expected.bodyNotMatches.join(" or ")}` : "") +
        (expected.bodyExcludes ? ` body excludes ${JSON.stringify(expected.bodyExcludes)}` : ""),
    );
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
