import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isStaleExchangeError } from "@/lib/auth-errors";
import { reportError, reportInfo, requestFields } from "@/lib/log";

export const prerender = false;

// Landing for the e-mail confirmation link (PKCE): exchange the `code` for a session and continue to the app.
// Any failure ends on the sign-in page with a fixed message; the link works only in the browser that signed up
// (the code verifier cookie is set there), and a reused link fails the exchange. Those expected failures are an info
// line, anything else an error report.
export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not_configured");
  }

  const params = context.url.searchParams;
  const code = params.get("code");
  if (!code || params.has("error") || params.has("error_code")) {
    return context.redirect("/auth/signin?error=link_expired");
  }

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (isStaleExchangeError(error)) {
        reportInfo("auth.callback.stale", { ...requestFields(context), code: error.code, status: error.status });
      } else {
        reportError("auth.callback.failed", error, { ...requestFields(context), status: error.status });
      }
      return context.redirect("/auth/signin?error=link_expired");
    }
  } catch (error) {
    reportError("auth.callback.exception", error, requestFields(context));
    return context.redirect("/auth/signin?error=link_expired");
  }

  return context.redirect("/dashboard");
};
