import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/api/groups"];
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname: requestPath } = context.url;
  if (PROTECTED_ROUTES.some((route) => requestPath === route || requestPath.startsWith(`${route}/`))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  const pathname = context.url.pathname.replace(/\/+$/, "");
  if (context.locals.user && AUTH_ROUTES.includes(pathname)) {
    return context.redirect("/dashboard");
  }

  return next();
});
