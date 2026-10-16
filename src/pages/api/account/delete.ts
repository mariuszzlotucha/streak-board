import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeUuid } from "@/lib/group-rules";
import { clearJoinCode } from "@/lib/join-code";

export const prerender = false;

/**
 * Ends the deleted account's session. GoTrue no longer knows the user, and supabase-js ignores that answer and clears
 * the session cookies anyway. Any other failure, returned or thrown, is reported, but the account is already deleted,
 * so it never changes where the request ends.
 */
async function endSession(context: APIContext, supabase: NonNullable<ReturnType<typeof createClient>>): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      reportError("account.delete.signout_failed", error, requestFields(context));
    }
  } catch (error) {
    reportError("account.delete.signout_failed", error, requestFields(context));
  }
}

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    // Only an owner with other members has to name a successor; a missing or malformed choice is left to the database,
    // which refuses it (P0003) exactly when one is needed and ignores it otherwise.
    const successorId = normalizeUuid(form.get("successor_id"));

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // delete_own_account deletes the caller (auth.uid() inside the function) in one transaction: it hands the group to
    // the successor or deletes it with its sole member, passes the caller's tasks to the group's owner, then removes the
    // account. 42501 without a session, P0003 for a missing or invalid successor.
    const { error, status } = await supabase.rpc("delete_own_account", successorId ? { p_successor: successorId } : {});
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("account.delete.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }

    await endSession(context, supabase);
    // A pending invite belongs to this browser session; don't offer it to the next person who signs in.
    clearJoinCode(context.cookies);
    return context.redirect("/?account=deleted");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("account.delete.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
