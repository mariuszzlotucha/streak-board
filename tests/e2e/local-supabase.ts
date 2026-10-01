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
  password: string;
  client: TestClient;
}

interface Stack {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

const PERSONA_PASSWORD = "E2e-persona-123!";
const authOptions = { persistSession: false, autoRefreshToken: false } as const;

let stack: Stack | undefined;

function localStack(): Stack {
  if (stack) return stack;
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
  // Accounts are created and deleted here: never against a hosted project.
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to create E2E accounts on non-local Supabase host "${hostname}".`);
  }
  stack = { url, anonKey, serviceRoleKey };
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

/** A confirmed account whose email contains `token`, with a signed-in client that goes through RLS. */
export async function createPersona(token: string): Promise<Persona> {
  const email = `e2e-${token}@example.test`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PERSONA_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createPersona: admin.createUser failed: ${error.message}`);

  const { url, anonKey } = localStack();
  const client = createClient<Database>(url, anonKey, { auth: authOptions });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PERSONA_PASSWORD });
  if (signInError) throw new Error(`createPersona: sign-in failed: ${signInError.message}`);

  return { id: data.user.id, email, password: PERSONA_PASSWORD, client };
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

export async function createTaskAs(persona: Persona, groupId: string, title: string): Promise<void> {
  const { error } = await persona.client
    .from("tasks")
    .insert({ group_id: groupId, created_by: persona.id, title, recurrence: "daily" });
  if (error) throw new Error(`createTaskAs: insert failed: ${error.message}`);
}

/**
 * Deletes the personas' groups (the owner foreign key is ON DELETE RESTRICT, so groups go first; members and tasks
 * cascade) and then the accounts. Every call is checked: a cleanup that fails must turn the run red, not leave
 * rows behind under a green test.
 */
export async function deletePersonas(personas: Persona[]): Promise<void> {
  if (personas.length === 0) return;
  const admin = adminClient();
  const { error: groupsError } = await admin
    .from("groups")
    .delete()
    .in(
      "owner_id",
      personas.map((persona) => persona.id),
    );
  if (groupsError) throw new Error(`deletePersonas: deleting groups failed: ${groupsError.message}`);
  for (const persona of personas) {
    const { error } = await admin.auth.admin.deleteUser(persona.id);
    if (error) throw new Error(`deletePersonas: deleting ${persona.email} failed: ${error.message}`);
  }
}
