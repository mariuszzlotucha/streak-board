import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportInfo, requestFields } from "@/lib/log";
import { checkoffResponse } from "@/lib/checkoff-response";
import { uncheck } from "@/lib/checkoffs";
import { normalizeUuid } from "@/lib/group-rules";
import { getTask } from "@/lib/tasks";

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
      reportInfo("uncheck.invalid_id", requestFields(context));
      return checkoffResponse(context, { kind: "invalid" });
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return checkoffResponse(context, { kind: "not_configured" });
    }

    // RLS hides other groups' tasks and deleted ones: a stale submit gets `gone`. The task's recurrence decides which
    // rows the undo removes.
    const task = await getTask(supabase, taskId);
    if (!task) {
      reportInfo("uncheck.task_gone", { ...requestFields(context), taskId });
      return checkoffResponse(context, { kind: "gone" });
    }

    // Nothing ticked (or not enrolled) deletes zero rows: a quiet ok, like Leave.
    const outcome = await uncheck(supabase, user.id, task, new Date());
    if (outcome.kind === "unknown") {
      reportError("uncheck.failed", outcome.error, { ...requestFields(context), taskId });
    }
    return checkoffResponse(context, outcome);
  } catch (error) {
    reportError("uncheck.exception", error, requestFields(context));
    return checkoffResponse(context, { kind: "unknown", error });
  }
};
