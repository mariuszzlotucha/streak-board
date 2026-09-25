import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toSignInErrorCode } from "@/lib/auth-errors";
import { rememberEmail } from "@/lib/auth-email";

export const POST: APIRoute = async (context) => {
  try {
    const form = await context.request.formData();
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      rememberEmail(context.cookies, email);
      return context.redirect("/auth/signin?error=not_configured");
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      rememberEmail(context.cookies, email);
      return context.redirect(`/auth/signin?error=${toSignInErrorCode(error)}`);
    }

    return context.redirect("/dashboard");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the sign-in page with a fixed message.
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Sign-in request failed", error);
    return context.redirect("/auth/signin?error=unknown");
  }
};
