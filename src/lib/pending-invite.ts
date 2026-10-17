import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeJoinCode } from "@/lib/group-rules";
import { clearJoinCode, peekJoinCode, rememberJoinCode } from "@/lib/join-code";
import { reportError, reportMapped, type ReportContext } from "@/lib/log";
import { noticePath } from "@/lib/notices";
import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/**
 * The user_metadata key that carries an invite from sign-up to the first dashboard visit. The e-mail confirmation link
 * works only in the browser that signed up, so a user who confirms elsewhere and signs in there has no `join_code`
 * cookie; the account still has the code.
 */
export const INVITE_METADATA_KEY = "join_code";

/** The invite the sign-up form should store with the new account (the pending cookie), or null. */
export function inviteForSignUp(cookies: AstroCookies): Record<string, string> | null {
  const code = peekJoinCode(cookies);
  return code ? { [INVITE_METADATA_KEY]: code } : null;
}

/**
 * Joins the signed-in user to the group of a pending invite (the cookie, else the code stored at sign-up) and answers
 * where the dashboard should go: `?notice=group_joined` on success, `?error=<code>` when the invite cannot be used
 * (unknown code, already in a group). A transient failure keeps the invite in the cookie and answers null, so the
 * dashboard renders and offers the "Join <group>?" card as a manual retry; no invite answers null too.
 * The code stored with the account is removed once the invite is joined or refused.
 */
export async function joinPendingInvite(
  supabase: Supabase,
  cookies: AstroCookies,
  user: User,
  log: ReportContext,
): Promise<string | null> {
  const stored = normalizeJoinCode(user.user_metadata[INVITE_METADATA_KEY]);
  const code = peekJoinCode(cookies) ?? stored;
  if (!code) return null;

  const { error, status } = await supabase.rpc("join_group", { p_join_code: code });
  if (!error) {
    await settle(supabase, cookies, stored, log);
    return noticePath("/dashboard", "group_joined");
  }

  const errorCode = toGroupErrorCode(error);
  reportMapped("groups.invite.failed", errorCode, error, { ...log, status, codeLength: code.length });
  if (errorCode === "invalid_code" || errorCode === "already_in_group") {
    const fromCookie = peekJoinCode(cookies) !== null;
    await settle(supabase, cookies, stored, log);
    // Only an invite the user just opened is news; a copy stored at sign-up for someone already in a group is not.
    return errorCode === "already_in_group" && !fromCookie ? null : `/dashboard?error=${errorCode}`;
  }
  // Keep the invite where the card reads it, so the user can retry from the dashboard.
  rememberJoinCode(cookies, code);
  return null;
}

/** Spends the invite: the cookie always, the copy stored with the account when there is one. Never throws. */
async function settle(supabase: Supabase, cookies: AstroCookies, stored: string | null, log: ReportContext) {
  clearJoinCode(cookies);
  if (!stored) return;
  try {
    const { error } = await supabase.auth.updateUser({ data: { [INVITE_METADATA_KEY]: null } });
    if (error) reportError("groups.invite.clear_failed", error, log);
  } catch (error) {
    // A copy left behind is harmless: the next visit finds the user in a group and spends it again.
    reportError("groups.invite.clear_failed", error, log);
  }
}
