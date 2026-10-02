import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeUuid } from "@/lib/group-rules";
import { getMyGroup } from "@/lib/groups";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const userId = normalizeUuid(form.get("user_id"));
    // Not the caller's own id: leaving is the separate /leave action. Without this check the group_members_delete_self
    // policy would let a non-owner delete their own row through this route.
    if (!userId || userId === user.id.toLowerCase()) {
      return context.redirect("/dashboard?error=forbidden");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // The group comes from the caller's own membership, never from the request.
    const group = await getMyGroup(supabase);
    if (!group) {
      // No group left (deleted in another tab): a stale submit ends where the user wanted to be, not on a
      // "not allowed" alert.
      return context.redirect("/dashboard");
    }

    // Only the owner may delete another member's row. RLS turns "not the owner", "not a member of this group" and
    // "the owner's own row" into an empty result, not an error. The neq is a second guard for the caller's own row
    // (see the string comparison above): Postgres compares the uuids, whatever spelling of the id arrived.
    const { data, error, status } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", userId)
      .neq("user_id", user.id)
      .select("id");
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.remove_member.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }
    if (data.length === 0) {
      // For the owner (whose own id was refused above) nothing to delete means the target already left or was
      // removed: a double click or a stale page. Anyone else was refused by RLS.
      return context.redirect(group.owner_id === user.id ? "/dashboard" : "/dashboard?error=forbidden");
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.remove_member.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
