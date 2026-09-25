import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
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
      return context.redirect("/dashboard?error=forbidden");
    }

    // Only the owner may delete another member's row. RLS turns "not the owner", "not a member of this group" and
    // "the owner's own row" into an empty result, not an error.
    const { data, error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", userId)
      .select("id");
    if (error) {
      return context.redirect(`/dashboard?error=${toGroupErrorCode(error)}`);
    }
    if (data.length === 0) {
      return context.redirect("/dashboard?error=forbidden");
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Remove member request failed", error);
    return context.redirect("/dashboard?error=unknown");
  }
};
