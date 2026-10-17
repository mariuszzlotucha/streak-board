import { reminderRun } from "@/lib/reminder-rules";
import { reportError, reportInfo } from "@/lib/log";
import type { PeriodKey } from "@/lib/streak-rules";
import { createAnonClient } from "@/lib/supabase-anon";
import { buildPushRequest, importVapidKeys, type PushSubscriptionKeys, type VapidKeys } from "@/lib/reminders/web-push";

/** The Worker bindings the reminder run reads, taken from the scheduled handler's `env` argument (not `astro:env`). */
export interface ReminderEnv {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  REMINDER_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  CONTACT_EMAIL?: string;
}

const REQUIRED_CONFIG = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "REMINDER_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "CONTACT_EMAIL",
] as const satisfies readonly (keyof ReminderEnv)[];

/** Sends in flight at once: waiting on fetch costs no CPU, signing and encryption do. */
export const SEND_CONCURRENCY = 6;

export interface RunCounts {
  subscriptions: number;
  sent: number;
  pruned: number;
  failed: number;
}

export type RunSummary =
  | { due: false }
  | { due: true; today: PeriodKey; week: PeriodKey | null; outcome: "config_missing" | "due_failed" }
  | ({ due: true; today: PeriodKey; week: PeriodKey | null; outcome: "done" } & RunCounts);

type AnonClient = ReturnType<typeof createAnonClient>;

/** Seams for the unit tests; production uses the global fetch and the real anon client. */
export interface RunDeps {
  fetch?: (request: Request) => Promise<Response>;
  createClient?: (url: string, key: string) => AnonClient;
}

type SendOutcome = "sent" | "expired" | "failed";

/** Titles named in one notification; the rest are counted, so the payload stays far below the ~4 KB push limit. */
export const MAX_LISTED_TASKS = 5;

/** The notification the service worker shows: one line listing the tasks still open in their current period. */
export function reminderPayload(taskNames: readonly string[]): string {
  // On Sunday weekly titles arrive in the same list as daily ones; both close tonight, so "today" holds for both.
  const listed = taskNames.slice(0, MAX_LISTED_TASKS).join(", ");
  const more = taskNames.length - MAX_LISTED_TASKS;
  return JSON.stringify({
    title: "StreakBoard",
    body: more > 0 ? `Still to do today: ${listed} and ${more} more` : `Still to do today: ${listed}`,
    url: "/dashboard",
  });
}

/** Maps a push-service answer: 2xx sent, 404/410 the subscription is gone, anything else a failure. */
export function sendOutcome(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "sent";
  if (status === 404 || status === 410) return "expired";
  return "failed";
}

async function sendOne(
  sub: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  now: Date,
  fetcher: (request: Request) => Promise<Response>,
): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetcher(await buildPushRequest(sub, payload, vapid, now));
  } catch (error) {
    // A fetch error's message can carry the URL; only its name is reported, never the endpoint.
    const name = error instanceof Error ? error.name : "unknown";
    reportError("reminders.send.failed", new Error(`push request threw ${name}`), { status: null });
    return "failed";
  }
  const outcome = sendOutcome(response.status);
  if (outcome === "expired") {
    reportInfo("reminders.subscription.expired", { status: response.status });
  } else if (outcome === "failed") {
    // The body is not read: a push service may echo the endpoint in it.
    reportError("reminders.send.failed", new Error(`push service answered ${response.status}`), {
      status: response.status,
    });
  }
  return outcome;
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function eachLimited<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/** The cron entry point: on the 20:00 Warsaw run, sends one reminder per due subscription and prunes expired ones. */
export async function runReminders(env: ReminderEnv, now: Date, deps: RunDeps = {}): Promise<RunSummary> {
  const run = reminderRun(now);
  if (!run.due) {
    reportInfo("reminders.run.skipped", { at: now.toISOString() });
    return { due: false };
  }
  const { today, week } = run;
  reportInfo("reminders.run.started", { at: now.toISOString(), today, week });

  const missing = REQUIRED_CONFIG.filter((name) => !env[name]);
  if (missing.length > 0) {
    // Names only, never values.
    reportInfo("reminders.config.missing", { missing: missing.join(",") });
    return { due: true, today, week, outcome: "config_missing" };
  }
  const config = env as Required<ReminderEnv>;
  const fetcher = deps.fetch ?? ((request: Request) => fetch(request));
  const supabase = (deps.createClient ?? createAnonClient)(config.SUPABASE_URL, config.SUPABASE_KEY);

  const { data, error } = await supabase.rpc("due_reminders", {
    p_secret: config.REMINDER_SECRET,
    p_today: today,
    // The generated Args type marks p_week non-null, but the function takes null (no weekly tasks before Sunday).
    p_week: week as unknown as string,
  });
  if (error) {
    reportError("reminders.due.failed", error);
    return { due: true, today, week, outcome: "due_failed" };
  }

  const rows = data;
  const counts: RunCounts = { subscriptions: rows.length, sent: 0, pruned: 0, failed: 0 };
  const expired: string[] = [];
  if (rows.length > 0) {
    let vapid: VapidKeys;
    try {
      vapid = await importVapidKeys(config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY, config.CONTACT_EMAIL);
    } catch (importError) {
      reportError("reminders.config.invalid", importError);
      counts.failed = rows.length;
      reportInfo("reminders.run.done", { ...counts });
      return { due: true, today, week, outcome: "done", ...counts };
    }
    await eachLimited(rows, SEND_CONCURRENCY, async (row) => {
      const outcome = await sendOne(row, reminderPayload(row.task_names), vapid, now, fetcher);
      if (outcome === "sent") counts.sent++;
      else if (outcome === "expired") expired.push(row.endpoint);
      else counts.failed++;
    });
  }

  if (expired.length > 0) {
    const { error: pruneError } = await supabase.rpc("prune_push_subscriptions", {
      p_secret: config.REMINDER_SECRET,
      p_endpoints: expired,
    });
    if (pruneError) reportError("reminders.prune.failed", pruneError, { count: expired.length });
    else counts.pruned = expired.length;
  }

  reportInfo("reminders.run.done", { ...counts });
  return { due: true, today, week, outcome: "done", ...counts };
}
