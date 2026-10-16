// Pure validation shared by the React islands and the server. Keep this file free of server-only imports
// (no `astro:env/server`, no Supabase client) so it is safe to bundle for the browser.

export const MIN_NICKNAME_LENGTH = 2;
export const MAX_NICKNAME_LENGTH = 24;

/** Trims the same characters as the DB CHECK on nicknames.nickname: space, tab, CR, LF (not NBSP or other Unicode spaces). */
export function trimNickname(input: string): string {
  return input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/**
 * Trims like the DB CHECK on nicknames.nickname and counts code points, like Postgres char_length.
 * Returns null unless the trimmed nickname is 2-24 characters.
 */
export function normalizeNickname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const nickname = trimNickname(input);
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points on purpose: matches Postgres char_length
  const length = [...nickname].length;
  return length >= MIN_NICKNAME_LENGTH && length <= MAX_NICKNAME_LENGTH ? nickname : null;
}
