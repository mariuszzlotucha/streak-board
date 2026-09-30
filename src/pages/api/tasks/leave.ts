import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { normalizeUuid } from "@/lib/group-rules";
import { toTaskErrorCode } from "@/lib/task-errors";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const taskId = normalizeUuid(form.get("task_id"));
    if (!taskId) {
      return context.redirect("/dashboard?error=forbidden");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // Only the caller's own row can match (RLS), so "not joined" and "task gone" both come back empty: a quiet no-op.
    const { error } = await supabase
      .from("task_participants")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", user.id)
      .select("task_id");
    if (error) {
      return context.redirect(`/dashboard?error=${toTaskErrorCode(error)}`);
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Leave task request failed", error);
    return context.redirect("/dashboard?error=unknown");
  }
};
