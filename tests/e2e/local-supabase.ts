// Test data for E2E specs whose risk needs users or groups of their own (the shared session in
// playwright/.auth/user.json belongs to one fixed account). It mirrors tests/helpers/supabase.ts, which cannot be
// imported here because it relies on Vitest's `inject`. Writes go through each persona's own anon-key session, so they
// pass the same RLS as the app; the service role is used only to create and delete accounts.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

type TestClient = SupabaseClient<Database>;

export interface Persona {
  id: string;
  email: string;
  /** The persona's nickname (S-14): its token, which the group sees instead of the address. */
  nickname: string;
  password: string;
  client: TestClient;
}

interface Stack {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const PERSONA_PASSWORD = "E2e-persona-123!";
// The longest nickname the database accepts (nicknames_nickname_length).
const MAX_NICKNAME_LENGTH = 24;
const authOptions = { persistSession: false, autoRefreshToken: false } as const;

let stack: Stack | undefined;

// Resolved the way tests/setup/global-setup.ts (the reference copy) and scripts/e2e-user.mjs resolve it: the
// TEST_SUPABASE_* variables, all three or none, else `supabase status`. The identical rule keeps the seed account and
// the personas on the same stack.
function stackFromEnv(): Stack | null {
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

function stackFromCli(): Stack {
  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error("Could not read the local Supabase status. Start it with `npx supabase start`.", { cause: error });
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
    throw new Error("Local Supabase status is missing API_URL, ANON_KEY or SERVICE_ROLE_KEY.");
  }
  return { url, anonKey, serviceRoleKey };
}

function localStack(): Stack {
  if (stack) return stack;
  const resolved = stackFromEnv() ?? stackFromCli();
  // Accounts are created and deleted here: never against a hosted project.
  const { hostname } = new URL(resolved.url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to create E2E accounts on non-local Supabase host "${hostname}".`);
  }
  stack = resolved;
  return stack;
}

function adminClient(): TestClient {
  const { url, serviceRoleKey } = localStack();
  return createClient<Database>(url, serviceRoleKey, { auth: authOptions });
}

/** `<label>-<8 hex>`: unique per call, and no token is a substring of another, so a text search for one is exact. */
export function uniqueToken(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

/**
 * A confirmed account whose email contains `token` and whose nickname is `token`, with a signed-in client that goes
 * through RLS. The nickname row is written with the service role (the gate needs it before the dashboard).
 */
export async function createPersona(token: string): Promise<Persona> {
  if (token.length > MAX_NICKNAME_LENGTH) {
    throw new Error(`createPersona: the token "${token}" is longer than a nickname may be (${MAX_NICKNAME_LENGTH})`);
  }
  const email = `e2e-${token}@example.test`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PERSONA_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createPersona: admin.createUser failed: ${error.message}`);
  const { error: nicknameError } = await admin.from("nicknames").insert({ user_id: data.user.id, nickname: token });
  if (nicknameError) {
    // The account would leak without a Persona to clean it up.
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`createPersona: nickname insert failed: ${nicknameError.message}`);
  }

  const { url, anonKey } = localStack();
  const client = createClient<Database>(url, anonKey, { auth: authOptions });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PERSONA_PASSWORD });
  if (signInError) throw new Error(`createPersona: sign-in failed: ${signInError.message}`);

  return { id: data.user.id, email, nickname: token, password: PERSONA_PASSWORD, client };
}

export async function createGroupAs(persona: Persona, name: string): Promise<string> {
  const { error } = await persona.client.from("groups").insert({ name, owner_id: persona.id });
  if (error) throw new Error(`createGroupAs: insert failed: ${error.message}`);
  // Filtered by owner on purpose: the setup must not depend on the very RLS policy the spec is checking.
  const { data, error: readError } = await persona.client
    .from("groups")
    .select("id")
    .eq("owner_id", persona.id)
    .single();
  if (readError) throw new Error(`createGroupAs: read-back failed: ${readError.message}`);
  return data.id;
}

/** A daily task. The creator is enrolled as its participant by the `tasks_add_creator_to_task` trigger. */
export async function createTaskAs(persona: Persona, groupId: string, title: string): Promise<void> {
  const { error } = await persona.client
    .from("tasks")
    .insert({ group_id: groupId, created_by: persona.id, title, recurrence: "daily" });
  if (error) throw new Error(`createTaskAs: insert failed: ${error.message}`);
}

/** The group's invite code, read through the owner's own client (the owner always sees their group). */
export async function readJoinCode(persona: Persona, groupId: string): Promise<string> {
  const { data, error } = await persona.client.from("groups").select("join_code").eq("id", groupId).single();
  if (error) throw new Error(`readJoinCode: read failed: ${error.message}`);
  return data.join_code;
}

/** Joins the group behind `code` as the persona, through the same `join_group` RPC the app calls. */
export async function joinGroupAs(persona: Persona, code: string): Promise<void> {
  const { error } = await persona.client.rpc("join_group", { p_join_code: code });
  if (error) throw new Error(`joinGroupAs: join_group failed: ${error.message}`);
}

/**
 * Deletes accounts a spec created through the real sign-up form (so no `Persona` exists for them), by e-mail: looks
 * them up through the admin API (paginated, as tests/setup/global-setup.ts does), deletes the groups they own and then
 * the accounts. An e-mail with no account is an error too: a cleanup that silently skips is a cleanup that leaks.
 */
export async function deleteAccountsByEmail(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const admin = adminClient();
  const wanted = new Set(emails.map((email) => email.toLowerCase()));
  const ids = new Map<string, string>();
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`deleteAccountsByEmail: listUsers failed: ${error.message}`);
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && wanted.has(email)) ids.set(email, user.id);
    }
    if (data.users.length < perPage) break;
  }
  const missing = [...wanted].filter((email) => !ids.has(email));
  if (missing.length > 0) throw new Error(`deleteAccountsByEmail: no account for ${missing.join(", ")}`);

  const { error: groupsError } = await admin
    .from("groups")
    .delete()
    .in("owner_id", [...ids.values()]);
  if (groupsError) throw new Error(`deleteAccountsByEmail: deleting groups failed: ${groupsError.message}`);
  // tasks.created_by is ON DELETE RESTRICT: tasks the accounts created in groups they did not own go before them.
  const { error: tasksError } = await admin
    .from("tasks")
    .delete()
    .in("created_by", [...ids.values()]);
  if (tasksError) throw new Error(`deleteAccountsByEmail: deleting tasks failed: ${tasksError.message}`);
  for (const [email, id] of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteAccountsByEmail: deleting ${email} failed: ${error.message}`);
  }
}

/**
 * Deletes the personas' groups (the owner foreign key is ON DELETE RESTRICT, so groups go first; members and tasks
 * cascade), then the tasks they created in other groups (the creator foreign key is ON DELETE RESTRICT too) and then
 * the accounts. A persona the spec already deleted (account deletion in the app) answers user_not_found, which is not
 * a failure. Every other error is: a cleanup that fails must turn the run red, not leave rows behind under a green
 * test.
 */
export async function deletePersonas(personas: Persona[]): Promise<void> {
  if (personas.length === 0) return;
  const admin = adminClient();
  const ids = personas.map((persona) => persona.id);
  const { error: groupsError } = await admin.from("groups").delete().in("owner_id", ids);
  if (groupsError) throw new Error(`deletePersonas: deleting groups failed: ${groupsError.message}`);
  const { error: tasksError } = await admin.from("tasks").delete().in("created_by", ids);
  if (tasksError) throw new Error(`deletePersonas: deleting tasks failed: ${tasksError.message}`);
  for (const persona of personas) {
    const { error } = await admin.auth.admin.deleteUser(persona.id);
    if (error && error.code !== "user_not_found") {
      throw new Error(`deletePersonas: deleting ${persona.email} failed: ${error.message}`);
    }
  }
}
