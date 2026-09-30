import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, inject } from "vitest";
import type { Database } from "@/types";
import { TEST_EMAIL_DOMAIN, TEST_EMAIL_PREFIX, TEST_PASSWORD } from "../setup/constants";

export type TestClient = SupabaseClient<Database>;

export interface TestUser {
  id: string;
  email: string;
  client: TestClient;
}

export interface TestGroup {
  id: string;
  joinCode: string;
}

const authOptions = { persistSession: false, autoRefreshToken: false } as const;

const createdUserIds: string[] = [];
const createdGroupIds: string[] = [];

export function adminClient(): TestClient {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseServiceRoleKey"), { auth: authOptions });
}

export function anonClient(): TestClient {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), { auth: authOptions });
}

export async function createTestUser(): Promise<TestUser> {
  const email = `${TEST_EMAIL_PREFIX}${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createTestUser: admin.createUser failed: ${error.message}`);
  createdUserIds.push(data.user.id);

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signInError) throw new Error(`createTestUser: sign-in failed: ${signInError.message}`);

  return { id: data.user.id, email, client };
}

export async function createGroupAs(user: TestUser, name: string): Promise<TestGroup> {
  const { error } = await user.client.from("groups").insert({ name, owner_id: user.id });
  if (error) throw new Error(`createGroupAs: insert failed: ${error.message}`);

  const { data, error: selectError } = await user.client
    .from("groups")
    .select("id, join_code")
    .eq("owner_id", user.id)
    .single();
  if (selectError) throw new Error(`createGroupAs: read-back failed: ${selectError.message}`);
  createdGroupIds.push(data.id);

  return { id: data.id, joinCode: data.join_code };
}

export async function joinGroupAs(user: TestUser, code: string): Promise<string> {
  const { data, error } = await user.client.rpc("join_group", { p_join_code: code });
  if (error) throw new Error(`joinGroupAs: join_group failed: ${error.message}`);
  return data;
}

export async function adminMemberIds(groupId: string): Promise<string[]> {
  const { data, error } = await adminClient().from("group_members").select("user_id").eq("group_id", groupId);
  if (error) throw new Error(`adminMemberIds failed: ${error.message}`);
  return data.map((row) => row.user_id).sort();
}

// Tasks are not tracked: they disappear through the group_id cascade in cleanupGroups and the created_by cascade in
// cleanupUsers.
export async function createTaskAs(
  user: TestUser,
  groupId: string,
  title: string,
  recurrence: string,
): Promise<string> {
  // The id comes from the column default (the grants do not allow sending it), so read it back.
  const { error } = await user.client
    .from("tasks")
    .insert({ group_id: groupId, created_by: user.id, title, recurrence });
  if (error) throw new Error(`createTaskAs: insert failed: ${error.message}`);

  const { data, error: selectError } = await user.client
    .from("tasks")
    .select("id")
    .eq("group_id", groupId)
    .eq("created_by", user.id)
    .eq("title", title)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (selectError) throw new Error(`createTaskAs: read-back failed: ${selectError.message}`);
  return data.id;
}

export async function adminTask(taskId: string) {
  const { data, error } = await adminClient()
    .from("tasks")
    .select("id, group_id, created_by, title, recurrence")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`adminTask failed: ${error.message}`);
  return data;
}

export async function cleanupGroups(): Promise<void> {
  const ids = createdGroupIds.splice(0);
  if (ids.length === 0) return;
  const { error } = await adminClient().from("groups").delete().in("id", ids);
  if (error) throw new Error(`cleanupGroups failed: ${error.message}`);
}

export async function cleanupUsers(): Promise<void> {
  await cleanupGroups();
  const admin = adminClient();
  const ids = createdUserIds.splice(0);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`cleanupUsers: deleteUser failed: ${error.message}`);
  }
}

afterEach(cleanupGroups);
afterAll(cleanupUsers);
