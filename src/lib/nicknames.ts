import { normalizeNickname } from "@/lib/nickname-rules";
import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/** The caller's own nickname, or null when the account has none yet. RLS limits the select to it. Throws on a Supabase error. */
export async function getOwnNickname(supabase: Supabase, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("nicknames").select("nickname").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.nickname ?? null;
}

// Keys a provider may put into user_metadata, best first. Google (through Supabase Auth) is expected to set both; the
// exact keys are known only from reading the Auth server's sources, so a missing key just leaves the field empty.
const NAME_KEYS = ["full_name", "name"] as const;

/**
 * The value the nickname field starts with: the current nickname when there is one; otherwise the first name from the
 * account's metadata that passes the nickname rules (normalized); otherwise "". A suggestion only, never saved by itself.
 */
export function suggestNickname(current: string | null, metadata: Record<string, unknown> | undefined): string {
  if (current !== null) return current;
  for (const key of NAME_KEYS) {
    const suggestion = normalizeNickname(metadata?.[key]);
    if (suggestion !== null) return suggestion;
  }
  return "";
}
