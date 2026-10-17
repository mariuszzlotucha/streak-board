import { toGroupErrorCode, type GroupErrorCode } from "@/lib/group-errors";

export type TaskErrorCode = "invalid_title" | "title_taken" | "invalid_recurrence";

const TASK_ERROR_MESSAGES: Record<TaskErrorCode, string> = {
  invalid_title: "Enter a task title between 1 and 80 characters.",
  title_taken: "Your group already has a task with this name. Pick another one.",
  invalid_recurrence: "Choose once, daily or weekly.",
};

/** The unique index on (group, title) (migration unique_names), named in the message of its 23505. */
export const TASK_TITLE_KEY = "tasks_group_title_key";

/** Maps a Postgres SQLSTATE (from a PostgREST error) to a task or group error code. */
export function toTaskErrorCode(error: { code?: string; message?: string }): TaskErrorCode | GroupErrorCode {
  // 23514 is the CHECK on the title length or on the recurrence list; the endpoints validate both first.
  if (error.code === "23514") return "invalid_title";
  if (error.code === "23505" && error.message?.includes(`"${TASK_TITLE_KEY}"`)) return "title_taken";
  return toGroupErrorCode(error);
}

/** Resolves an `?error=` query value to a task message; a foreign value is never reflected. */
export function resolveTaskError(param: string | null): string | null {
  if (param !== null && Object.hasOwn(TASK_ERROR_MESSAGES, param)) {
    return TASK_ERROR_MESSAGES[param as TaskErrorCode];
  }
  return null;
}
