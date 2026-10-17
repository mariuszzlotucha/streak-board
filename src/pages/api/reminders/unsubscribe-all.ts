import type { APIRoute } from "astro";
import { handleReminderRoute } from "@/lib/reminders/subscription-route";

export const prerender = false;

// Removes every subscription of the caller, on every device. It takes no body.
export const POST: APIRoute = (context) =>
  handleReminderRoute(context, "reminders.unsubscribe_all", false, (supabase) => supabase.rpc("unsubscribe_all_push"));
