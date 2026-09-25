export type GroupErrorCode =
  "not_configured" | "invalid_name" | "invalid_code" | "already_in_group" | "forbidden" | "unknown";

const GROUP_ERROR_MESSAGES: Record<GroupErrorCode, string> = {
  not_configured: "Groups are not available right now.",
  invalid_name: "Enter a group name between 1 and 80 characters.",
  invalid_code: "This invite link or code is not valid.",
  already_in_group: "You are already in a group.",
  forbidden: "You are not allowed to do that.",
  unknown: "Something went wrong. Please try again.",
};

/** Maps a Postgres SQLSTATE (from a PostgREST error) to a group error code. */
export function toGroupErrorCode(error: { code?: string }): GroupErrorCode {
  switch (error.code) {
    case "23514":
      return "invalid_name";
    case "23505":
      return "already_in_group";
    case "P0002":
      return "invalid_code";
    case "42501":
      return "forbidden";
    default:
      return "unknown";
  }
}

/** Resolves an `?error=` query value to a message; a foreign value is never reflected. */
export function resolveGroupError(param: string | null): string | null {
  if (param !== null && Object.hasOwn(GROUP_ERROR_MESSAGES, param)) {
    return GROUP_ERROR_MESSAGES[param as GroupErrorCode];
  }
  return null;
}

export function groupErrorMessage(code: GroupErrorCode): string {
  return GROUP_ERROR_MESSAGES[code];
}
