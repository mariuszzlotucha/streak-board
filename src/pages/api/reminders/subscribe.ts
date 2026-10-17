import type { APIRoute } from "astro";
import { handleReminderRoute, parseSubscription } from "@/lib/reminders/subscription-route";

export const prerender = false;

// Registers this device's push subscription for the caller (a re-subscribe of the same endpoint replaces its keys).
export const POST: APIRoute = (context) =>
  handleReminderRoute(context, "reminders.subscribe", true, (supabase, body) => {
    const subscription = parseSubscription(body);
    if (!subscription) return null;
    return supabase.rpc("subscribe_push", {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth: subscription.auth,
    });
  });
