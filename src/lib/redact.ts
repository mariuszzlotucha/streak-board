// Values that must never reach a log line or an error tracker. Pure and import-free so server code and tests share it.

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// PostgREST `details` embed key values: `Key (join_code)=(abc123) already exists.`
const KEY_VALUE = /Key \(([^)]*)\)=\([^)]*\)/g;
// The invite code is a bearer secret and sits in the path of `/join/<code>`.
const JOIN_CODE = /\/join\/[^/?#\s"'`]+/g;

/** Masks e-mail-like tokens, the value of `Key (column)=(value)` fragments and the code segment of `/join/<code>`. */
export function scrubSecrets(text: string): string {
  return text.replace(KEY_VALUE, "Key ($1)=(…)").replace(JOIN_CODE, "/join/[code]").replace(EMAIL, "[email]");
}
