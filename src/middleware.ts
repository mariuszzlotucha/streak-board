import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { resolveAuthState, unavailableResponse } from "@/lib/auth-state";
import { reportError, requestFields } from "@/lib/log";
import { getOwnNickname } from "@/lib/nicknames";
import { runWithSentry } from "@/lib/sentry";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/settings", "/account", "/api/groups", "/api/tasks", "/api/account"];
// Protected paths a signed-in user without a nickname may still reach: the page that sets it and its route.
const NICKNAME_ROUTES = ["/account/nickname", "/api/account/nickname"];
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

// Missing configuration is the same on every request, so it is reported once per isolate.
let reportedNotConfigured = false;

async function handle(context: APIContext, next: MiddlewareNext): Promise<Response> {
  try {
    const supabase = createClient(context.request.headers, context.cookies);
    const state = await resolveAuthState(supabase);
    context.locals.user = state.kind === "signed_in" ? state.user : null;
    context.locals.nickname = null;

    if (state.kind === "unavailable") {
      reportError("auth.unavailable", state.error, requestFields(context));
    } else if (state.kind === "unexpected") {
      reportError("auth.unexpected", state.error, requestFields(context));
    } else if (state.kind === "not_configured" && !reportedNotConfigured) {
      reportedNotConfigured = true;
      reportError("auth.not_configured", new Error("SUPABASE_URL or SUPABASE_KEY is not set"), requestFields(context));
    }

    const { pathname: requestPath } = context.url;
    const matches = (route: string) => requestPath === route || requestPath.startsWith(`${route}/`);
    if (PROTECTED_ROUTES.some(matches)) {
      // An Auth outage is not a sign-out: answer 503 instead of sending the visitor to the sign-in page.
      if (state.kind === "unavailable") {
        return unavailableResponse(context.request);
      }
      const { user } = context.locals;
      if (!user) {
        return context.redirect("/auth/signin");
      }
      // A signed-in user always comes with a client: resolveAuthState(null) is "not_configured", never "signed_in".
      if (supabase) {
        try {
          context.locals.nickname = await getOwnNickname(supabase, user.id);
        } catch (error) {
          // A failed read is an outage, not a missing nickname: do not send the user to choose one again.
          reportError("nickname.lookup.failed", error, requestFields(context));
          return unavailableResponse(context.request);
        }
      }
      // Every account needs a nickname before it shows up to its group or acts in it.
      if (context.locals.nickname === null && !NICKNAME_ROUTES.some(matches)) {
        return context.redirect("/account/nickname");
      }
    }

    const pathname = context.url.pathname.replace(/\/+$/, "");
    if (context.locals.user && AUTH_ROUTES.includes(pathname)) {
      return context.redirect("/dashboard");
    }

    return await next();
  } catch (error) {
    // Astro renders its own 500 for an exception that escapes the middleware, so report it here and rethrow.
    reportError("request.unhandled", error, requestFields(context));
    throw error;
  }
}

// The wrapper sits inside the middleware, so the adapter's entry point stays as it is and everything the middleware
// calls runs with a client and a scope.
export const onRequest = defineMiddleware((context, next) => runWithSentry(context, () => handle(context, next)));
