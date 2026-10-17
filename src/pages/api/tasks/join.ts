import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { normalizeUuid } from "@/lib/group-rules";
import { noticePath } from "@/lib/notices";
import { toTaskErrorCode } from "@/lib/task-errors";
import { taskExists } from "@/lib/tasks";

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

    // Not visible to the caller (already deleted, other group): a stale submit is no error, and with nothing joined it
    // gets no confirmation either; the missing task shows on the dashboard. Without this check the insert policy would
    // answer 42501, which maps to a loud `forbidden` banner.
    if (!(await taskExists(supabase, taskId))) {
      return context.redirect("/dashboard");
    }

    const { error, status } = await supabase.from("task_participants").insert({ task_id: taskId, user_id: user.id });
    if (error) {
      // 23505: already joined, so the caller is in the task and the confirmation is true.
      if (error.code === "23505") {
        return context.redirect(noticePath("/dashboard", "task_joined"));
      }
      // 23503: the task was deleted between the check above and the insert: nothing joined, no confirmation.
      if (error.code === "23503") {
        return context.redirect("/dashboard");
      }
      const errorCode = toTaskErrorCode(error);
      reportMapped("tasks.join.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }

    return context.redirect(noticePath("/dashboard", "task_joined"));
  } catch (error) {
    reportError("tasks.join.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
