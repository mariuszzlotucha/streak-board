// Seed account for the E2E suite: creates the confirmed user that tests/e2e/auth.setup.ts and seed.spec.ts sign in
// with, on a fresh stack where .env has no credentials (the CI `e2e` job). Locally the account comes from .env instead.
//
// Run: node scripts/e2e-user.mjs
// It resolves the stack like tests/setup/global-setup.ts (the TEST_SUPABASE_* variables first, else
// `supabase status -o env`), refuses a non-local host, creates `e2e-ci-<token>@example.test` with a random password
// through the admin API (email_confirm: true), gives it its nickname (S-14) and prints exactly two lines for the CI step
// to append to $GITHUB_ENV:
//
//   E2E_USERNAME=<email>
//   E2E_PASSWORD=<password>
//
// Exit 0 on success; any failure exits 1 with a message on stderr. No key is ever printed.

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const START_HINT = "Start the local stack with `supabase start` (npx supabase start) and re-run.";

/**
 * @typedef {object} StackConfig
 * @property {string} url The API URL.
 * @property {string} anonKey The anon key.
 * @property {string} serviceRoleKey The service-role key (admin API).
 */

/**
 * The stack from the TEST_SUPABASE_* variables: all three or none. The rule mirrors tests/setup/global-setup.ts (the
 * reference copy); tests/e2e/local-supabase.ts applies the same one, so the seed account and the personas share a stack.
 * @returns {StackConfig | null} The config, or null when none of the variables is set.
 */
function resolveFromEnv() {
  const url = process.env.TEST_SUPABASE_URL;
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  const provided = [url, anonKey, serviceRoleKey].filter(Boolean).length;
  if (provided === 0) return null;
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Set all of TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY, or none of them.",
    );
  }
  return { url, anonKey, serviceRoleKey };
}

/**
 * The stack from `supabase status -o env`.
 * @returns {StackConfig} The config.
 */
function resolveFromCli() {
  let output;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`Could not read the local Supabase status. ${START_HINT}`, { cause: error });
  }
  const values = new Map();
  for (const line of output.split("\n")) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1]) values.set(match[1], match[2]);
  }
  const url = values.get("API_URL");
  const anonKey = values.get("ANON_KEY");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(`Local Supabase status is missing API_URL, ANON_KEY or SERVICE_ROLE_KEY. ${START_HINT}`);
  }
  return { url, anonKey, serviceRoleKey };
}

/**
 * Accounts are created here: never on a hosted project.
 * @param {string} url The API URL.
 */
function assertLocal(url) {
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to create an E2E account on non-local Supabase host "${hostname}".`);
  }
}

async function main() {
  const config = resolveFromEnv() ?? resolveFromCli();
  assertLocal(config.url);

  const email = `e2e-ci-${randomBytes(4).toString("hex")}@example.test`;
  // 32 hex characters: well above the password policy, and a different account on every run.
  const password = randomBytes(16).toString("hex");

  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`admin.createUser failed: ${error.message}`);
  // Every account needs a nickname before the dashboard. The rule is nicknameFor in tests/e2e/helpers.ts (the local
  // part, cut to 24 characters), repeated here because this script runs as plain Node; seed.spec.ts expects it.
  const nickname = email.split("@")[0].slice(0, 24);
  const { error: nicknameError } = await admin.from("nicknames").insert({ user_id: data.user.id, nickname });
  if (nicknameError) {
    // Nothing prints the account's credentials on this path, so it would leak.
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`nickname insert failed: ${nicknameError.message}`);
  }

  // Exactly these two lines on stdout, nothing else: the CI step appends them to $GITHUB_ENV.
  console.log(`E2E_USERNAME=${email}`);
  console.log(`E2E_PASSWORD=${password}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
