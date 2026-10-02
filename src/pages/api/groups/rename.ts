import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeGroupName } from "@/lib/group-rules";
import { getMyGroup } from "@/lib/groups";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const name = normalizeGroupName(form.get("name"));
    if (!name) {
      return context.redirect("/dashboard?error=invalid_name");
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

    // Only the name column is updatable. RLS turns "not the owner" into an empty result, not an error.
    const { data, error, status } = await supabase.from("groups").update({ name }).eq("id", group.id).select("id");
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.rename.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }
    if (data.length === 0) {
      return context.redirect("/dashboard?error=forbidden");
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.rename.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
