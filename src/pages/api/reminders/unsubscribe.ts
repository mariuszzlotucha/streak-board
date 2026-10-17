import type { APIRoute } from "astro";
import { handleReminderRoute, parseUnsubscribe } from "@/lib/reminders/subscription-route";

export const prerender = false;

// Removes this device's subscription; only the caller's own row matches, so an unknown endpoint is a quiet no-op.
export const POST: APIRoute = (context) =>
  handleReminderRoute(context, "reminders.unsubscribe", true, (supabase, body) => {
    const endpoint = parseUnsubscribe(body);
    if (!endpoint) return null;
    return supabase.rpc("unsubscribe_push", { p_endpoint: endpoint });
  });
