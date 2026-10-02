import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeGroupName } from "@/lib/group-rules";
import { clearJoinCode } from "@/lib/join-code";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
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

    // Only name and owner_id are sent; id and join_code come from column defaults.
    const { error, status } = await supabase.from("groups").insert({ name, owner_id: user.id });
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.create.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }

    clearJoinCode(context.cookies);
    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.create.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
