import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportInfo, requestFields } from "@/lib/log";
import { checkoffResponse } from "@/lib/checkoff-response";
import { checkOff } from "@/lib/checkoffs";
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
      reportInfo("checkoff.invalid_id", requestFields(context));
      return checkoffResponse(context, { kind: "invalid" });
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return checkoffResponse(context, { kind: "not_configured" });
    }

    // RLS hides other groups' tasks and deleted ones: a stale submit gets `gone` instead of the policy's loud 42501.
    const task = await getTask(supabase, taskId);
    if (!task) {
      reportInfo("checkoff.task_gone", { ...requestFields(context), taskId });
      return checkoffResponse(context, { kind: "gone" });
    }

    const outcome = await checkOff(supabase, user.id, task, new Date());
    if (outcome.kind === "unknown") {
      reportError("checkoff.failed", outcome.error, { ...requestFields(context), taskId });
    }
    return checkoffResponse(context, outcome);
  } catch (error) {
    reportError("checkoff.exception", error, requestFields(context));
    return checkoffResponse(context, { kind: "unknown", error });
  }
};
