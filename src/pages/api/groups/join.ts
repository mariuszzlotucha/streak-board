import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toGroupErrorCode } from "@/lib/group-errors";
import { normalizeJoinCode } from "@/lib/group-rules";
import { clearJoinCode } from "@/lib/join-code";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const code = normalizeJoinCode(form.get("code"));
    if (!code) {
      clearJoinCode(context.cookies);
      return context.redirect("/dashboard?error=invalid_code");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/dashboard?error=not_configured");
    }

    const { error, status } = await supabase.rpc("join_group", { p_join_code: code });
    if (error) {
      const errorCode = toGroupErrorCode(error);
      reportMapped("groups.join.failed", errorCode, error, {
        ...requestFields(context),
        status,
        codeLength: code.length,
      });
      // A rejected invite is spent; anything else (e.g. a transient failure) keeps it so the user can retry.
      if (errorCode === "invalid_code" || errorCode === "already_in_group") {
        clearJoinCode(context.cookies);
      }
      return context.redirect(`/dashboard?error=${errorCode}`);
    }

    clearJoinCode(context.cookies);
    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the dashboard with a fixed message.
    reportError("groups.join.exception", error, requestFields(context));
    return context.redirect("/dashboard?error=unknown");
  }
};
