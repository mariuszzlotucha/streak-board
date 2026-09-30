import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { TestProject } from "vitest/node";
import { TEST_EMAIL_PREFIX } from "./constants";

declare module "vitest" {
  interface ProvidedContext {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceRoleKey: string;
  }
}

interface StackConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const START_HINT = "Start the local stack with `supabase start` (npx supabase start) and re-run the tests.";

function resolveFromEnv(): StackConfig | null {
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

function resolveFromCli(): StackConfig {
  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`Could not read the local Supabase status. ${START_HINT}`, { cause: error });
  }
  const values = new Map<string, string>();
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

function assertLocal(url: string): void {
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to run integration tests against non-local Supabase host "${hostname}".`);
  }
}

async function assertReachable(config: StackConfig): Promise<void> {
  try {
    const response = await fetch(`${config.url}/auth/v1/health`, { headers: { apikey: config.anonKey } });
    if (!response.ok) throw new Error(`health check returned HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Local Supabase API at ${config.url} is not reachable. ${START_HINT}`, { cause: error });
  }
}

async function sweepLeftovers(config: StackConfig): Promise<void> {
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const perPage = 200;
  const leftovers: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email?.startsWith(TEST_EMAIL_PREFIX)) leftovers.push(user.id);
    }
    if (data.users.length < perPage) break;
  }
  if (leftovers.length === 0) return;
  const { error: groupsError } = await admin.from("groups").delete().in("owner_id", leftovers);
  if (groupsError) throw groupsError;
  for (const id of leftovers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}

export default async function setup(project: TestProject) {
  const config = resolveFromEnv() ?? resolveFromCli();
  assertLocal(config.url);
  await assertReachable(config);

  project.provide("supabaseUrl", config.url);
  project.provide("supabaseAnonKey", config.anonKey);
  project.provide("supabaseServiceRoleKey", config.serviceRoleKey);

  return async () => {
    await sweepLeftovers(config);
  };
}
