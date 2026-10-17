import { reminderRun } from "@/lib/reminder-rules";
import { reportInfo } from "@/lib/log";
import type { PeriodKey } from "@/lib/streak-rules";

/** The Worker bindings the reminder run reads, taken from the scheduled handler's `env` argument (not `astro:env`). */
export interface ReminderEnv {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
}

export type RunSummary = { due: false } | { due: true; today: PeriodKey; week: PeriodKey | null };

/** The cron entry point: decides whether this run is the 20:00 Warsaw one and logs the outcome. Sends nothing yet. */
export function runReminders(_env: ReminderEnv, now: Date): Promise<RunSummary> {
  const run = reminderRun(now);
  if (!run.due) {
    reportInfo("reminders.run.skipped", { at: now.toISOString() });
    return Promise.resolve({ due: false });
  }
  reportInfo("reminders.run.started", { at: now.toISOString(), today: run.today, week: run.week });
  return Promise.resolve({ due: true, today: run.today, week: run.week });
}
