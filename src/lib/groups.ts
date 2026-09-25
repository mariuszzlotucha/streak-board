import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export const MAX_GROUP_NAME_LENGTH = 80;

export interface MyGroup {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
}

export interface GroupMember {
  user_id: string;
  email: string | null;
  joined_at: string;
  is_owner: boolean;
}

/**
 * Trims the same characters as the DB CHECK on groups.name (space, tab, CR, LF) and counts code points,
 * like Postgres char_length. Returns null unless the trimmed name is 1-80 characters.
 */
export function normalizeGroupName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points on purpose: matches Postgres char_length
  const length = [...name].length;
  return length >= 1 && length <= MAX_GROUP_NAME_LENGTH ? name : null;
}

/** The caller's own group, or null. RLS limits the select to it. Throws on a Supabase error. */
export async function getMyGroup(supabase: Supabase): Promise<MyGroup | null> {
  const { data, error } = await supabase.from("groups").select("id, name, join_code, owner_id").maybeSingle();
  if (error) throw error;
  return data;
}

/** The group name for a join code, or null for an unknown code. The generated type omits the NULL. */
export async function previewGroup(supabase: Supabase, code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("preview_group", { p_join_code: code });
  if (error) throw error;
  const name: string | null = data;
  return name;
}

/** Members of the caller's group (empty for a non-member). The generated type omits the NULL email. */
export async function listGroupMembers(supabase: Supabase, groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase.rpc("list_group_members", { p_group_id: groupId });
  if (error) throw error;
  // The generated types say every row has an email and the result is never null; at runtime either can be NULL.
  return Array.isArray(data) ? data : [];
}
