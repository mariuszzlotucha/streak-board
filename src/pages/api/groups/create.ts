import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeGroupName } from "@/lib/groups";
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
    const { error } = await supabase.from("groups").insert({ name, owner_id: user.id });
    if (error) {
      return context.redirect(`/dashboard?error=${toGroupErrorCode(error)}`);
    }

    clearJoinCode(context.cookies);
    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Create group request failed", error);
    return context.redirect("/dashboard?error=unknown");
  }
};
