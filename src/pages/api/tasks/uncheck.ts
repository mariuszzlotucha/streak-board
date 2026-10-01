import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
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
      return checkoffResponse(context, { kind: "gone" });
    }

    // Nothing ticked (or not enrolled) deletes zero rows: a quiet ok, like Leave.
    const outcome = await uncheck(supabase, user.id, task, new Date());
    if (outcome.kind === "unknown") {
      // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
      console.error("Uncheck task request failed", outcome.error);
    }
    return checkoffResponse(context, outcome);
  } catch (error) {
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Uncheck task request failed", error);
    return checkoffResponse(context, { kind: "unknown", error });
  }
};
