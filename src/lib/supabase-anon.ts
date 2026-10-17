import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

/**
 * A cookieless anon client for code that runs without a request (the reminder cron). It holds no session, so it can
 * only call what `anon` may call: the secret-guarded reminder functions. It lives apart from `supabase.ts` because the
 * cron takes its URL and key from the scheduled `env` argument, not from `astro:env`.
 */
export function createAnonClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
