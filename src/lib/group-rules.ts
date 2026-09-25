// Pure validation shared by the React islands and the server. Keep this file free of server-only imports
// (no `astro:env/server`, no Supabase client) so it is safe to bundle for the browser.

export const MAX_GROUP_NAME_LENGTH = 80;

const JOIN_CODE_PATTERN = /^[0-9a-f]{1,64}$/;

/** Trims the same characters as the DB CHECK on groups.name: space, tab, CR, LF (not NBSP or other Unicode spaces). */
export function trimGroupName(input: string): string {
  return input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/**
 * Trims like the DB CHECK on groups.name and counts code points, like Postgres char_length.
 * Returns null unless the trimmed name is 1-80 characters.
 */
export function normalizeGroupName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = trimGroupName(input);
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points on purpose: matches Postgres char_length
  const length = [...name].length;
  return length >= 1 && length <= MAX_GROUP_NAME_LENGTH ? name : null;
}

/**
 * Accepts a bare join code or a pasted invite link (`https://host/join/<code>`) and returns the lowercase code.
 * No fixed length: older groups have 8-character codes, new ones 12.
 */
export function normalizeJoinCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const withoutQuery = input.trim().toLowerCase().split(/[?#]/)[0];
  const lastSegment = withoutQuery.split("/").filter(Boolean).at(-1);
  if (!lastSegment || !JOIN_CODE_PATTERN.test(lastSegment)) return null;
  return lastSegment;
}
