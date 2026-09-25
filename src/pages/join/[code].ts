import type { APIRoute } from "astro";
import { rememberJoinCode } from "@/lib/join-code";

export const prerender = false;

// Public landing for invite links: keep the code across the sign-in redirect, then let the protected dashboard
// route anonymous visitors through sign-in. An invalid code is ignored; the dashboard shows the group state.
export const GET: APIRoute = (context) => {
  rememberJoinCode(context.cookies, context.params.code);
  return context.redirect("/dashboard");
};
