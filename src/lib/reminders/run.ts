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

export type SendOutcome = "sent" | "expired" | "failed";

/** Sends one reminder somewhere else; `at` is the run's ISO time. The Worker passes its own `ReminderSender` entrypoint. */
export type ReminderSend = (sub: PushSubscriptionKeys, payload: string, at: string) => Promise<SendOutcome>;

/**
 * Seams for the unit tests; production uses the global fetch and the real anon client. With `send`, each push leaves
 * the run (one invocation per push, so its encryption does not add to the run's CPU) and the run imports no keys.
 */
export interface RunDeps {
  fetch?: (request: Request) => Promise<Response>;
  createClient?: (url: string, key: string) => AnonClient;
  send?: ReminderSend;
}

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

/** One push in its own invocation: imports the keys from `env`, then sends; a bad key pair counts as a failure. */
export async function sendReminder(
  env: ReminderEnv,
  sub: PushSubscriptionKeys,
  payload: string,
  now: Date,
  fetcher: (request: Request) => Promise<Response> = (request) => fetch(request),
): Promise<SendOutcome> {
  let vapid: VapidKeys;
  try {
    vapid = await importVapidKeys(env.VAPID_PUBLIC_KEY ?? "", env.VAPID_PRIVATE_KEY ?? "", env.CONTACT_EMAIL ?? "");
  } catch (importError) {
    reportError("reminders.config.invalid", importError);
    return "failed";
  }
  return sendOne(sub, payload, vapid, now, fetcher);
}

/** Calls the outside sender; a thrown call (the invocation died, e.g. over its CPU limit) counts as a failure. */
async function sendElsewhere(send: ReminderSend, sub: PushSubscriptionKeys, payload: string, now: Date) {
  try {
    return await send({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, now.toISOString());
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    reportError("reminders.send.failed", new Error(`reminder sender threw ${name}`), { status: null });
    return "failed";
  }
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
  const tally = (row: (typeof rows)[number], outcome: SendOutcome) => {
    if (outcome === "sent") counts.sent++;
    else if (outcome === "expired") expired.push(row.endpoint);
    else counts.failed++;
  };
  const { send } = deps;
  if (rows.length > 0 && send) {
    await eachLimited(rows, SEND_CONCURRENCY, async (row) => {
      tally(row, await sendElsewhere(send, row, reminderPayload(row.task_names), now));
    });
  } else if (rows.length > 0) {
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
      tally(row, await sendOne(row, reminderPayload(row.task_names), vapid, now, fetcher));
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
