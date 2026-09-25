import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toSignUpErrorCode } from "@/lib/auth-errors";

export const POST: APIRoute = async (context) => {
  try {
    const form = await context.request.formData();
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect("/auth/signup?error=not_configured");
    }
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return context.redirect(`/auth/signup?error=${toSignUpErrorCode(error)}`);
    }

    return context.redirect("/auth/confirm-email");
  } catch (error) {
    // Malformed body or a thrown Supabase/network error: end on the sign-up page with a fixed message.
    // eslint-disable-next-line no-console -- server-side log; the user only sees the fixed message
    console.error("Sign-up request failed", error);
    return context.redirect("/auth/signup?error=unknown");
  }
};
