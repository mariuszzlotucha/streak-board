import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { getMyGroup } from "@/lib/groups";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
      return context.redirect("/auth/signin");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // A member deletes only their own membership row. RLS turns "not allowed" (the owner cannot leave)
    // and "no membership" into an empty result, not an error.
    const { data, error, status } = await supabase.from("group_members").delete().eq("user_id", user.id).select("id");
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.leave.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }
    if (data.length === 0) {
      // Nothing was deleted: the caller is the owner (still in their group), or they had already left (a stale
      // second submit), which is the outcome they asked for.
      const group = await getMyGroup(supabase);
      return context.redirect(group ? "/dashboard?error=forbidden" : "/dashboard");
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // A thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.leave.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
