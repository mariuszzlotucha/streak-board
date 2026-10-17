import type { APIContext } from "astro";
import { reportError, requestFields } from "@/lib/log";
import { base64UrlDecode } from "@/lib/reminders/web-push";
import { createClient } from "@/lib/supabase";

// The shared body of `POST /api/reminders/{subscribe,unsubscribe,unsubscribe-all}`: the browser's push subscription for
// this device (`PushSubscription.toJSON()`), checked and capped here, then one Phase 2 function on `auth.uid()`.

/** The largest body read; a real subscription is well under 1 KB. */
export const MAX_BODY_BYTES = 4096;
/** Push service endpoints are a few hundred characters; anything longer is not one. */
export const MAX_ENDPOINT_LENGTH = 2048;
/** `p256dh` is 87 base64url characters and `auth` 22; the cap leaves room without accepting arbitrary text. */
export const MAX_KEY_LENGTH = 256;

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface SubscriptionBody {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The browsers' push services (Chrome/Android, Firefox, Safari/iOS, Edge). The cron POSTs to every stored endpoint, so
 * any other host would make it an outbound relay; `subscribe_push` enforces the same list in SQL.
 */
export const PUSH_SERVICE_HOST =
  /^(fcm\.googleapis\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)$/;

/** An `https:` URL on a known push service, of at most `MAX_ENDPOINT_LENGTH` characters. */
export function parseEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) return null;
  try {
    const url = new URL(value);
    // `url.hostname` is lowercased, so the prefix is compared case-insensitively (a browser may send a mixed-case host).
    return url.protocol === "https:" &&
      value.toLowerCase().startsWith(`https://${url.hostname}/`) &&
      url.port === "" &&
      PUSH_SERVICE_HOST.test(url.hostname)
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Decoded sizes RFC 8291 fixes: the browser's P-256 public key (uncompressed point) and its auth secret. */
export const P256DH_BYTES = 65;
export const AUTH_BYTES = 16;

function parseKey(value: unknown, bytes: number): string | null {
  if (typeof value !== "string" || value.length > MAX_KEY_LENGTH || !BASE64URL.test(value)) return null;
  let decoded: Uint8Array;
  try {
    decoded = base64UrlDecode(value.replace(/=+$/, ""));
  } catch {
    return null;
  }
  // A key the cron cannot encrypt to would fail every evening and never be pruned, so it is refused here.
  if (decoded.length !== bytes || (bytes === P256DH_BYTES && decoded[0] !== 4)) return null;
  return value;
}

/** `{ endpoint, keys: { p256dh, auth } }`, or null when any part is missing or malformed. */
export function parseSubscription(value: unknown): SubscriptionBody | null {
  if (!isRecord(value) || !isRecord(value.keys)) return null;
  const endpoint = parseEndpoint(value.endpoint);
  const p256dh = parseKey(value.keys.p256dh, P256DH_BYTES);
  const auth = parseKey(value.keys.auth, AUTH_BYTES);
  return endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null;
}

/** `{ endpoint }` (keys, when sent, are ignored), or null. */
export function parseUnsubscribe(value: unknown): string | null {
  return isRecord(value) ? parseEndpoint(value.endpoint) : null;
}

const HEADERS = { "Cache-Control": "no-store" };

function status(code: number): Response {
  return new Response(null, { status: code, headers: HEADERS });
}

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/**
 * One reminders route: signed in (the middleware already redirects anyone else; 401 here is the fallback), a same-origin
 * JSON body when the action takes one, then the database call. 204 on success, 400 on a bad body, 415 on a non-JSON one,
 * 413 on an oversized one, 503 without Supabase, 500 (reported) on a returned error or a throw.
 */
export async function handleReminderRoute(
  context: APIContext,
  event: string,
  takesBody: boolean,
  call: (supabase: Supabase, body: unknown) => PromiseLike<{ error: unknown; status?: number }> | null,
): Promise<Response> {
  try {
    if (!context.locals.user) return status(401);

    // A JSON POST is not covered by Astro's origin check, so a foreign Origin is refused here.
    const origin = context.request.headers.get("origin");
    if (origin !== null && origin !== context.url.origin) return status(403);

    let body: unknown = null;
    if (takesBody) {
      const mediaType = (context.request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (mediaType !== "application/json") return status(415);
      if (Number(context.request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return status(413);
      const text = await context.request.text();
      // Measured in bytes: without a Content-Length header, multibyte text could pass a character count.
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return status(413);
      try {
        body = JSON.parse(text);
      } catch {
        return status(400);
      }
    }

    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) return status(503);

    const pending = call(supabase, body);
    if (pending === null) return status(400);
    const result = await pending;
    if (result.error) {
      // Never the endpoint or the keys in a report: they identify the device's push channel.
      reportError(`${event}.failed`, result.error, { ...requestFields(context), status: result.status ?? null });
      return status(500);
    }
    return status(204);
  } catch (error) {
    reportError(`${event}.exception`, error, requestFields(context));
    return status(500);
  }
}
