import type { AstroCookies } from "astro";

export const JOIN_CODE_COOKIE = "join_code";

const JOIN_CODE_PATTERN = /^[0-9a-f]{1,64}$/;
// Set with path "/", so delete() must repeat it or the browser keeps the cookie.
const COOKIE_PATH = "/";

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

/** Carries a pending invite across the sign-in redirect. Ignores an invalid code. */
export function rememberJoinCode(cookies: AstroCookies, code: unknown): void {
  const normalized = normalizeJoinCode(code);
  if (!normalized) return;

  cookies.set(JOIN_CODE_COOKIE, normalized, {
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 3600,
  });
}

/** Reads the pending invite code without consuming it; a forged cookie value is dropped. */
export function peekJoinCode(cookies: AstroCookies): string | null {
  return normalizeJoinCode(cookies.get(JOIN_CODE_COOKIE)?.value);
}

export function clearJoinCode(cookies: AstroCookies): void {
  cookies.delete(JOIN_CODE_COOKIE, { path: COOKIE_PATH });
}
