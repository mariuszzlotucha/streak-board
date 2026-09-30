import { toGroupErrorCode, type GroupErrorCode } from "@/lib/group-errors";

export type TaskErrorCode = "invalid_title" | "invalid_recurrence";

const TASK_ERROR_MESSAGES: Record<TaskErrorCode, string> = {
  invalid_title: "Enter a task title between 1 and 80 characters.",
  invalid_recurrence: "Choose once, daily or weekly.",
};

/** Maps a Postgres SQLSTATE (from a PostgREST error) to a task or group error code. */
export function toTaskErrorCode(error: { code?: string }): TaskErrorCode | GroupErrorCode {
  // 23514 is the CHECK on the title length or on the recurrence list; the endpoints validate both first.
  if (error.code === "23514") return "invalid_title";
  return toGroupErrorCode(error);
}

/** Resolves an `?error=` query value to a task message; a foreign value is never reflected. */
export function resolveTaskError(param: string | null): string | null {
  if (param !== null && Object.hasOwn(TASK_ERROR_MESSAGES, param)) {
    return TASK_ERROR_MESSAGES[param as TaskErrorCode];
  }
  return null;
}
