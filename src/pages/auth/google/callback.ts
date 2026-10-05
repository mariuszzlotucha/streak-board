import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, reportInfo, requestFields } from "@/lib/log";
import { toGoogleExchangeErrorCode, toGoogleReturnErrorCode } from "@/lib/auth-errors";

export const prerender = false;

// The query of this public GET is attacker-controlled: a provider value reaches a report only when it is a short token.
const REPORTABLE_PARAM = /^[a-z0-9_]{1,40}$/;

function reportable(value: string | null): string | undefined {
  return value !== null && REPORTABLE_PARAM.test(value) ? value : undefined;
}

// Landing for the Google sign-in (PKCE): Supabase returns here with `?code=`, or with an error when the user cancels.
// Cancellation, a stale attempt and a failure each end on the sign-in page with their own fixed message; no provider
// text (`error_description`) is shown or logged. The route reads and clears no cookie: the code verifier cookie is
// consumed by the exchange itself, and `join_code` has to survive the round trip.
export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not_configured");
  }

  const params = context.url.searchParams;
  const returned = toGoogleReturnErrorCode(params);
  if (returned) {
    // Every outcome here is driven by the request's parameters, so it is an info line, never an error report.
    reportInfo("auth.google.callback.returned", {
      ...requestFields(context),
      outcome: returned,
      providerError: reportable(params.get("error")),
      providerErrorCode: reportable(params.get("error_code")),
    });
    return context.redirect(`/auth/signin?error=${returned}`);
  }

  try {
    // A code is present: `toGoogleReturnErrorCode` answers `oauth_failed` without one.
    const { error } = await supabase.auth.exchangeCodeForSession(params.get("code") ?? "");
    if (error) {
      const errorCode = toGoogleExchangeErrorCode(error);
      if (errorCode === "unknown") {
        reportError("auth.google.callback.failed", error, { ...requestFields(context), status: error.status });
      } else {
        reportInfo("auth.google.callback.failed", {
          ...requestFields(context),
          outcome: errorCode,
          code: error.code,
          status: error.status,
        });
      }
      return context.redirect(`/auth/signin?error=${errorCode}`);
    }
  } catch (error) {
    reportError("auth.google.callback.exception", error, requestFields(context));
    return context.redirect("/auth/signin?error=unknown");
  }

  return context.redirect("/dashboard");
};
