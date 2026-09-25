import type { AstroCookies } from "astro";
import { normalizeJoinCode } from "@/lib/group-rules";

export const JOIN_CODE_COOKIE = "join_code";

// Set with path "/", so delete() must repeat it or the browser keeps the cookie.
const COOKIE_PATH = "/";

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
