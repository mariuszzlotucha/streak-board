import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { getMyGroup } from "@/lib/groups";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // The group comes from the caller's own membership, never from the request.
    const group = await getMyGroup(supabase);
    if (!group) {
      // No group left to delete: a stale second submit after the delete already went through ends where the user
      // wanted to be, not on a "not allowed" alert.
      return context.redirect("/dashboard");
    }

    // Only the owner may delete the group. RLS turns "not the owner" into an empty result, not an error.
    // The memberships disappear through the ON DELETE CASCADE.
    const { data, error, status } = await supabase.from("groups").delete().eq("id", group.id).select("id");
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.delete.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }
    if (data.length === 0) {
      return context.redirect("/dashboard?error=forbidden");
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // A thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.delete.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
