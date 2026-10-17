// The Worker entry: Astro's request handler, unwrapped (request Sentry lives in the middleware), plus the cron trigger
// that runs the evening reminders and the `ReminderSender` entrypoint that sends each of them in its own invocation.
import { WorkerEntrypoint } from "cloudflare:workers";
import astro from "@astrojs/cloudflare/entrypoints/server";
import { runScheduledWithSentry, type ScheduledControllerLike, type WaitUntilContext } from "@/lib/sentry";
import { runReminders, sendReminder, type ReminderEnv, type ReminderSend } from "@/lib/reminders/run";
import type { PushSubscriptionKeys } from "@/lib/reminders/web-push";
import type { SentryEnv } from "@/lib/sentry-options";

/**
 * Reached only through the `REMINDER_SENDER` service binding (wrangler.jsonc), never from the internet. Each RPC call
 * is a separate invocation with its own CPU limit, so one push's encryption never counts against the cron run (README,
 * "CPU ceiling").
 */
export class ReminderSender extends WorkerEntrypoint<ReminderEnv> {
  send(sub: PushSubscriptionKeys, payload: string, at: string) {
    return sendReminder(this.env, sub, payload, new Date(at));
  }
}

type WorkerEnv = ReminderEnv & SentryEnv & { REMINDER_SENDER?: { send: ReminderSend } };

export default {
  fetch: astro.fetch,
  scheduled(controller: ScheduledControllerLike, env: WorkerEnv, ctx: WaitUntilContext): void {
    // Without the binding (a local run without it) the run sends in process, as before the fan-out. A closure, not
    // `.bind`: every property of an RPC stub is itself remote, so `send.bind` would not be Function.prototype.bind.
    const sender = env.REMINDER_SENDER;
    const send: ReminderSend | undefined = sender ? (sub, payload, at) => sender.send(sub, payload, at) : undefined;
    ctx.waitUntil(
      runScheduledWithSentry(controller, env, ctx, () =>
        runReminders(env, new Date(controller.scheduledTime), { send }),
      ),
    );
  },
};
