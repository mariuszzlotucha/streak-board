import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Landing for the e-mail confirmation link (PKCE): exchange the `code` for a session and continue to the app.
// Any failure ends on the sign-in page with a fixed message; the link works only in the browser that signed up
// (the code verifier cookie is set there), and a reused link fails the exchange.
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
      // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
      console.error("Confirmation link exchange failed", error);
      return context.redirect("/auth/signin?error=link_expired");
    }
  } catch (error) {
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Confirmation link exchange threw", error);
    return context.redirect("/auth/signin?error=link_expired");
  }

  return context.redirect("/dashboard");
};
