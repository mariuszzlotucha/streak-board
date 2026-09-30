import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { normalizeUuid } from "@/lib/group-rules";
import { toTaskErrorCode } from "@/lib/task-errors";
import { normalizeTaskTitle } from "@/lib/task-rules";
import { getTask } from "@/lib/tasks";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const taskId = normalizeUuid(form.get("task_id"));
    if (!taskId) {
      return context.redirect("/dashboard?error=forbidden");
    }
    const title = normalizeTaskTitle(form.get("title"));
    if (!title) {
      return context.redirect("/dashboard?error=invalid_title");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    // Not visible to the caller (deleted, other group): a stale submit ends quietly on the dashboard.
    if (!(await getTask(supabase, taskId))) {
      return context.redirect("/dashboard");
    }

    // Only the title column is updatable. RLS turns "not the creator" into an empty result, not an error.
    const { data, error } = await supabase.from("tasks").update({ title }).eq("id", taskId).select("id");
    if (error) {
      return context.redirect(`/dashboard?error=${toTaskErrorCode(error)}`);
    }
    if (data.length === 0) {
      return context.redirect("/dashboard?error=forbidden");
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Update task request failed", error);
    return context.redirect("/dashboard?error=unknown");
  }
};
