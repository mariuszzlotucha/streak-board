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
