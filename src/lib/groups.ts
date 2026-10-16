import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export interface MyGroup {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
}

/** A member as the app sees them: named by nickname (null until the account chooses one), never by e-mail address. */
export interface GroupMember {
  user_id: string;
  nickname: string | null;
  joined_at: string;
  is_owner: boolean;
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

/** Members of the caller's group (empty for a non-member). The generated type omits the NULL nickname. */
export async function listGroupMembers(supabase: Supabase, groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase.rpc("list_group_members", { p_group_id: groupId });
  if (error) throw error;
  // The generated types say every row has a nickname and the result is never null; at runtime either can be NULL.
  // Until the release that drops it, the RPC also returns each member's email, which the app must never pass on, so
  // every row is copied field by field instead of being returned as it came.
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const nickname: string | null = row.nickname;
    return { user_id: row.user_id, nickname, joined_at: row.joined_at, is_owner: row.is_owner };
  });
}
