// The fixed security headers every response carries. The middleware sets them on what the Worker answers;
// public/_headers repeats the same values for static files, which never reach the middleware. Change both together
// (tests/unit/security-headers.test.ts compares them).
export const SECURITY_HEADERS: readonly (readonly [name: string, value: string])[] = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
];

// Sets the headers the response does not set itself. A response with immutable headers (`Response.redirect`, a
// fetched response) is copied first, since writing to its headers throws.
export function withSecurityHeaders(response: Response): Response {
  let target = response;
  try {
    apply(target.headers);
  } catch {
    target = new Response(response.body, response);
    apply(target.headers);
  }
  return target;
}

function apply(headers: Headers) {
  for (const [name, value] of SECURITY_HEADERS) {
    if (!headers.has(name)) headers.set(name, value);
  }
}

// Astro computes the page's Content-Security-Policy (`security.csp` in astro.config.mjs, the Supabase origin added by
// src/layouts/Layout.astro). While the policy is observed, not enforced, the middleware sends it as Report-Only.
// Enforcing it is changing this constant to "enforce".
export const CSP_MODE: "report-only" | "enforce" = "report-only";

// Moves the page's `content-security-policy` to `content-security-policy-report-only` (copying a response whose
// headers are immutable). A response without the header (API routes, redirects) is returned as it is.
export function toReportOnly(response: Response): Response {
  const policy = response.headers.get("content-security-policy");
  if (CSP_MODE !== "report-only" || policy === null) return response;
  let target = response;
  try {
    target.headers.delete("content-security-policy");
  } catch {
    target = new Response(response.body, response);
    target.headers.delete("content-security-policy");
  }
  target.headers.set("content-security-policy-report-only", policy);
  return target;
}
