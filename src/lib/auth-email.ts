import type { AstroCookies } from "astro";

export const AUTH_EMAIL_COOKIE = "auth_email";

const MAX_EMAIL_LENGTH = 254;
// Scoped to the auth pages, so delete() must repeat it or the browser keeps the cookie.
const COOKIE_PATH = "/auth";

/** Remembers the submitted email for one page view after a failed sign-in or sign-up. Never call it on success. */
export function rememberEmail(cookies: AstroCookies, email: unknown): void {
  if (typeof email !== "string") return;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return;

  cookies.set(AUTH_EMAIL_COOKIE, trimmed, {
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60,
  });
}

/** Reads the remembered email and always deletes the cookie, so it is shown at most once. */
export function takeRememberedEmail(cookies: AstroCookies): string {
  const value = cookies.get(AUTH_EMAIL_COOKIE)?.value ?? "";
  cookies.delete(AUTH_EMAIL_COOKIE, { path: COOKIE_PATH });
  return value;
}
