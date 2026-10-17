import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeUuid } from "@/lib/group-rules";
import { noticePath } from "@/lib/notices";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    // A missing or malformed choice cannot name a member: the same message as a successor the database refuses.
    const newOwnerId = normalizeUuid(form.get("new_owner_id"));
    if (!newOwnerId) {
      return context.redirect("/dashboard?error=invalid_successor");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // transfer_group_ownership acts on the caller's own group (auth.uid() inside the function): 42501 when the caller
    // owns no group, P0003 when the chosen member is the caller or not a member of that group.
    const { error, status } = await supabase.rpc("transfer_group_ownership", { p_new_owner: newOwnerId });
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.transfer.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }

    return context.redirect(noticePath("/dashboard", "ownership_transferred"));
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.transfer.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
