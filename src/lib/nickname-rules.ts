// Pure validation shared by the React islands and the server. Keep this file free of server-only imports
// (no `astro:env/server`, no Supabase client) so it is safe to bundle for the browser.

export const MIN_NICKNAME_LENGTH = 2;
export const MAX_NICKNAME_LENGTH = 24;

/** An inclusive range of Unicode code points. */
export type CodePointRange = readonly [from: number, to: number];

/**
 * Code points a nickname may not contain: Unicode Cc and Cf (control and format characters such as NUL, the soft
 * hyphen, zero-width space, bidi overrides and tag characters), except the joiners ZWNJ and ZWJ, which emoji sequences
 * and some scripts need. The DB CHECK nicknames_nickname_visible spells out the same ranges (from U+0001: Postgres text
 * cannot hold NUL); tests/unit/nickname-rules.test.ts pins this list to the runtime's `\p{Cc}` and `\p{Cf}`.
 */
export const FORBIDDEN_NICKNAME_RANGES: readonly CodePointRange[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x0600, 0x0605],
  [0x061c, 0x061c],
  [0x06dd, 0x06dd],
  [0x070f, 0x070f],
  [0x0890, 0x0891],
  [0x08e2, 0x08e2],
  [0x180e, 0x180e],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
  [0x110bd, 0x110bd],
  [0x110cd, 0x110cd],
  [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0001, 0xe0001],
  [0xe0020, 0xe007f],
];

/**
 * Code points that are allowed but show nothing on their own: Unicode spaces and line/paragraph separators, the
 * joiners, Hangul fillers, the braille blank and variation selectors. A nickname needs at least one code point outside
 * this list, like the second half of the DB CHECK nicknames_nickname_visible. Not exhaustive: look-alike letters and
 * lone combining marks still pass.
 */
export const BLANK_NICKNAME_RANGES: readonly CodePointRange[] = [
  [0x0020, 0x0020],
  [0x00a0, 0x00a0],
  [0x115f, 0x1160],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x200c, 0x200d],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x2800, 0x2800],
  [0x3000, 0x3000],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xffa0, 0xffa0],
];

const hex = (codePoint: number): string => `\\u{${codePoint.toString(16)}}`;
const charClass = (ranges: readonly CodePointRange[]): string =>
  ranges.map(([from, to]) => (from === to ? hex(from) : `${hex(from)}-${hex(to)}`)).join("");

// Built per call, not at import and not memoised: a nickname is checked a few times per request, and this way a broken
// range list fails the test that uses it (a module-level pattern would break the import of every dependent module, and
// a memo would keep the pattern of whichever code built it first).
function nicknamePatterns(): { forbidden: RegExp; visible: RegExp } {
  return {
    forbidden: new RegExp(`[${charClass(FORBIDDEN_NICKNAME_RANGES)}]`, "u"),
    visible: new RegExp(`[^${charClass(BLANK_NICKNAME_RANGES)}]`, "u"),
  };
}

/** Trims the same characters as the DB CHECK on nicknames.nickname: space, tab, CR, LF (not NBSP or other Unicode spaces). */
export function trimNickname(input: string): string {
  return input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

/** True when the nickname has no forbidden code point and at least one that shows (see the two range lists). */
export function isVisibleNickname(nickname: string): boolean {
  const { forbidden, visible } = nicknamePatterns();
  return !forbidden.test(nickname) && visible.test(nickname);
}

/**
 * Trims like the DB CHECK on nicknames.nickname and counts code points, like Postgres char_length.
 * Returns null unless the trimmed nickname is 2-24 characters and visible (`isVisibleNickname`).
 */
export function normalizeNickname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const nickname = trimNickname(input);
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points on purpose: matches Postgres char_length
  const length = [...nickname].length;
  if (length < MIN_NICKNAME_LENGTH || length > MAX_NICKNAME_LENGTH) return null;
  return isVisibleNickname(nickname) ? nickname : null;
}
