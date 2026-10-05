import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, requestFields } from "@/lib/log";

export const prerender = false;

// Starts the Google sign-in (PKCE) from a form POST, so Astro's origin check guards it. The server-side call only builds
// the Supabase authorize URL; the code verifier cookie is written while it runs, so it is awaited before the redirect and
// the cookie travels on the same response. The route sets and clears no cookie of its own (`join_code` stays).
export const POST: APIRoute = async (context) => {
  try {
    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/auth/signin?error=not_configured");
    }
    // The return route must be in the project's Redirect URLs allow-list, or Supabase silently falls back to the Site URL.
    const redirectTo = `${new URL(context.request.url).origin}/auth/google/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });

    if (error || !data.url) {
      // The URL carries the PKCE challenge and is never reported.
      reportError("auth.google.start_failed", error ?? new Error("signInWithOAuth returned no URL"), {
        ...requestFields(context),
        status: error?.status,
      });
      return context.redirect("/auth/signin?error=unknown");
    }

    return context.redirect(data.url);
  } catch (error) {
    reportError("auth.google.start_exception", error, requestFields(context));
    return context.redirect("/auth/signin?error=unknown");
  }
};
