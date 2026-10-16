export type NicknameErrorCode = "not_configured" | "invalid_nickname" | "nickname_taken" | "forbidden" | "unknown";

const NICKNAME_ERROR_MESSAGES: Record<NicknameErrorCode, string> = {
  not_configured: "Nicknames are not available right now.",
  invalid_nickname: "Enter a nickname between 2 and 24 characters.",
  nickname_taken: "This nickname is already taken. Pick another one.",
  forbidden: "You are not allowed to do that.",
  unknown: "Something went wrong. Please try again.",
};

/** Maps a Postgres SQLSTATE (from a PostgREST error) to a nickname error code. */
export function toNicknameErrorCode(error: { code?: string }): NicknameErrorCode {
  switch (error.code) {
    case "23505":
      return "nickname_taken";
    case "23514":
      return "invalid_nickname";
    case "42501":
      return "forbidden";
    default:
      return "unknown";
  }
}

/** Resolves an `?error=` query value to a message; a foreign value is never reflected. */
export function resolveNicknameError(param: string | null): string | null {
  if (param !== null && Object.hasOwn(NICKNAME_ERROR_MESSAGES, param)) {
    return NICKNAME_ERROR_MESSAGES[param as NicknameErrorCode];
  }
  return null;
}

export function nicknameErrorMessage(code: NicknameErrorCode): string {
  return NICKNAME_ERROR_MESSAGES[code];
}
