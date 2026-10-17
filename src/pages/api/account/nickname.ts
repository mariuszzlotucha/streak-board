import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toNicknameErrorCode } from "@/lib/nickname-errors";
import { normalizeNickname } from "@/lib/nickname-rules";
import { noticePath } from "@/lib/notices";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    const form = await context.request.formData();
    const nickname = normalizeNickname(form.get("nickname"));
    if (!nickname) {
      return context.redirect("/account/nickname?error=invalid_nickname");
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/account/nickname?error=not_configured");
    }

    // set_nickname writes the caller's own row (auth.uid() inside the function); the database enforces the rules.
    const { error, status } = await supabase.rpc("set_nickname", { p_nickname: nickname });
    if (error) {
      // The report never carries the nickname: the code and the status are enough to tell a clash from an outage.
      const errorCode = toNicknameErrorCode(error);
      reportMapped("account.nickname.failed", errorCode, error, { ...requestFields(context), status });
      return context.redirect(`/account/nickname?error=${errorCode}`);
    }

    // The middleware read the nickname before this request: none means the first choice, which ends on the dashboard
    // (where a pending invite is still waiting in its cookie); a change goes back to the settings page.
    return context.redirect(
      noticePath(context.locals.nickname === null ? "/dashboard" : "/settings", "nickname_saved"),
    );
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: back on the nickname page with a fixed message.
    reportError("account.nickname.exception", error, requestFields(context));
    return context.redirect("/account/nickname?error=unknown");
  }
};
