import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { getMyGroup } from "@/lib/groups";
import { toTaskErrorCode } from "@/lib/task-errors";
import { normalizeRecurrence, normalizeTaskTitle } from "@/lib/task-rules";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    if (!user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const title = normalizeTaskTitle(form.get("title"));
    if (!title) {
      return context.redirect("/dashboard?error=invalid_title");
    }
    const recurrence = normalizeRecurrence(form.get("recurrence"));
    if (!recurrence) {
      return context.redirect("/dashboard?error=invalid_recurrence");
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

    const { error, status } = await supabase
      .from("tasks")
      .insert({ group_id: group.id, created_by: user.id, title, recurrence });
    if (error) {
      const errorCode = toTaskErrorCode(error);
      reportMapped("tasks.create.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/dashboard?error=${errorCode}`);
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("tasks.create.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
