export type GroupErrorCode =
  | "not_configured"
  | "invalid_name"
  | "name_taken"
  | "invalid_code"
  | "already_in_group"
  | "invalid_successor"
  | "forbidden"
  | "unknown";

const GROUP_ERROR_MESSAGES: Record<GroupErrorCode, string> = {
  not_configured: "Groups are not available right now.",
  invalid_name: "Enter a group name between 1 and 80 characters.",
  name_taken: "Another group already has this name. Pick another one.",
  invalid_code: "This invite link or code is not valid.",
  already_in_group: "You are already in a group.",
  invalid_successor: "Choose a member of your group to take over.",
  forbidden: "You are not allowed to do that.",
  unknown: "Something went wrong. Please try again.",
};

/** The unique index on the group name (migration unique_names); its name is the only way to tell its 23505 apart. */
export const GROUP_NAME_KEY = "groups_name_key";

/** Maps a Postgres SQLSTATE (from a PostgREST error) to a group error code. */
export function toGroupErrorCode(error: { code?: string; message?: string }): GroupErrorCode {
  switch (error.code) {
    case "23514":
      return "invalid_name";
    // Two unique indexes answer 23505 on a group write: the name, and one group per user (group_members.user_id).
    case "23505":
      return error.message?.includes(`"${GROUP_NAME_KEY}"`) ? "name_taken" : "already_in_group";
    case "P0002":
      return "invalid_code";
    // transfer_group_ownership: the chosen successor is missing, the caller, or no longer a member of the group.
    case "P0003":
      return "invalid_successor";
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
