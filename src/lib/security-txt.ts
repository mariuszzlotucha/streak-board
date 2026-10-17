// RFC 9116 security.txt. `Expires` is one year after the build, so a file not refreshed by a release in a year expires
// rather than pointing at a stale contact.
export const SECURITY_TXT_CANONICAL = "https://streakboard.app/.well-known/security.txt";

export function securityTxt(contact: string, builtAt: Date): string {
  const expires = new Date(builtAt);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  return [
    `Contact: mailto:${contact}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: pl, en",
    `Canonical: ${SECURITY_TXT_CANONICAL}`,
    "",
  ].join("\n");
}
