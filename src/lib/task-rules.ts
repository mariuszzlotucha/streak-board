// Pure validation shared by the React islands and the server. Keep this file free of server-only imports
// (no `astro:env/server`, no Supabase client) so it is safe to bundle for the browser.
import { trimGroupName } from "@/lib/group-rules";

export const MAX_TASK_TITLE_LENGTH = 80;

/** Must match the CHECK `tasks_recurrence_allowed` in the database. */
export const TASK_RECURRENCES = ["once", "daily", "weekly"] as const;

export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
};

/**
 * Trims like the DB CHECK on tasks.title (same characters as the group name) and counts code points, like Postgres
 * char_length. Returns null unless the trimmed title is 1-80 characters.
 */
export function normalizeTaskTitle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const title = trimGroupName(input);
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points on purpose: matches Postgres char_length
  const length = [...title].length;
  return length >= 1 && length <= MAX_TASK_TITLE_LENGTH ? title : null;
}

/** Exactly one of the allowed recurrence kinds, or null. */
export function normalizeRecurrence(input: unknown): TaskRecurrence | null {
  return TASK_RECURRENCES.find((kind) => kind === input) ?? null;
}
