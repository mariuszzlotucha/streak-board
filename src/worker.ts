// The Worker entry: Astro's request handler, unwrapped (request Sentry lives in the middleware), plus the cron trigger
// that runs the evening reminders.
import astro from "@astrojs/cloudflare/entrypoints/server";
import { runScheduledWithSentry, type ScheduledControllerLike, type WaitUntilContext } from "@/lib/sentry";
import { runReminders, type ReminderEnv } from "@/lib/reminders/run";
import type { SentryEnv } from "@/lib/sentry-options";

export default {
  fetch: astro.fetch,
  scheduled(controller: ScheduledControllerLike, env: ReminderEnv & SentryEnv, ctx: WaitUntilContext): void {
    ctx.waitUntil(
      runScheduledWithSentry(controller, env, ctx, () => runReminders(env, new Date(controller.scheduledTime))),
    );
  },
};
