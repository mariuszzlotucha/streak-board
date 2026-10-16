import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { getMyGroup } from "@/lib/groups";

export const prerender = false;

// The new owner's "Got it" on the dashboard notice. Every outcome ends on the dashboard without an error message: a
// notice that could not be cleared just shows again, and a failure is reported.
export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard");
    }

    // The group comes from the caller's own membership, never from the request.
    const group = await getMyGroup(supabase);
    if (!group) {
      return context.redirect("/dashboard");
    }

    // Only the owner may update the group (groups_update_by_owner): for anyone else, or a notice already cleared in
    // another tab, nothing changes and the empty result is a quiet no-op.
    const { error, status } = await supabase
      .from("groups")
      .update({ owner_notice_pending: false })
      .eq("id", group.id)
      .select("id");
    if (error) {
      reportMapped("groups.owner_notice.failed", toGroupErrorCode(error), error, { ...requestFields(context), status });
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // A thrown Supabase/network error: the notice stays and shows again on the dashboard.
    reportError("groups.owner_notice.exception", error, requestFields(context));
    return context.redirect("/dashboard");
  }
};
