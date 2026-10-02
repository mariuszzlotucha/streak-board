import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { reportError, requestFields } from "@/lib/log";
import { clearJoinCode } from "@/lib/join-code";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      reportError("auth.signout.failed", error, requestFields(context));
    }
  }
  // A pending invite belongs to this browser session; don't offer it to the next person who signs in.
  clearJoinCode(context.cookies);
  return context.redirect("/");
};
