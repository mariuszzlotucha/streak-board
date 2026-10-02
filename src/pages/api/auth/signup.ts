import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportMapped, requestFields } from "@/lib/log";
import { toSignUpErrorCode } from "@/lib/auth-errors";
import { rememberEmail } from "@/lib/auth-email";

export const POST: APIRoute = async (context) => {
  try {
    const form = await context.request.formData();
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      rememberEmail(context.cookies, email);
      return context.redirect("/auth/signup?error=not_configured");
    }
    // The confirmation link returns to this app (must be in the project's Redirect URLs allow-list).
    const emailRedirectTo = `${new URL(context.request.url).origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });

    if (error) {
      rememberEmail(context.cookies, email);
      const errorCode = toSignUpErrorCode(error);
      reportMapped("auth.signup.failed", errorCode, error, { ...requestFields(context), status: error.status });
      return context.redirect(`/auth/signup?error=${errorCode}`);
    }

    return context.redirect("/auth/confirm-email");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the sign-up page with a fixed message.
    reportError("auth.signup.exception", error, requestFields(context));
    return context.redirect("/auth/signup?error=unknown");
  }
};
