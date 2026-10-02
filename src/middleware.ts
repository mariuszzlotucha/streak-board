import { defineMiddleware } from "astro:middleware";
import { resolveAuthState, unavailableResponse } from "@/lib/auth-state";
import { reportError, requestFields } from "@/lib/log";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/api/groups", "/api/tasks"];
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

// Missing configuration is the same on every request, so it is reported once per isolate.
let reportedNotConfigured = false;

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const state = await resolveAuthState(createClient(context.request.headers, context.cookies));
    context.locals.user = state.kind === "signed_in" ? state.user : null;

    if (state.kind === "unavailable") {
      reportError("auth.unavailable", state.error, requestFields(context));
    } else if (state.kind === "unexpected") {
      reportError("auth.unexpected", state.error, requestFields(context));
    } else if (state.kind === "not_configured" && !reportedNotConfigured) {
      reportedNotConfigured = true;
      reportError("auth.not_configured", new Error("SUPABASE_URL or SUPABASE_KEY is not set"), requestFields(context));
    }

    const { pathname: requestPath } = context.url;
    if (PROTECTED_ROUTES.some((route) => requestPath === route || requestPath.startsWith(`${route}/`))) {
      // An Auth outage is not a sign-out: answer 503 instead of sending the visitor to the sign-in page.
      if (state.kind === "unavailable") {
        return unavailableResponse(context.request);
      }
      if (!context.locals.user) {
        return context.redirect("/auth/signin");
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
});
