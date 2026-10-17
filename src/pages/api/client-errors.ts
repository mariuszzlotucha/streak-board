import type { APIRoute } from "astro";
import { reportError, requestFields } from "@/lib/log";
import { CLIENT_ERROR_CODES, type ClientErrorCode } from "@/lib/pwa/register";

export const prerender = false;

// The largest body accepted; a known code is far shorter.
const MAX_BODY_BYTES = 256;

async function readAtMost(request: Request, limit: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel();
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Public on purpose (a failure can happen before sign-in). Only `text/plain` is accepted: it is what `sendBeacon` sends
// for a string, and Astro's origin check guards it, while a JSON POST from a foreign origin would pass that check.
// The body is the bare code; nothing the browser sends beyond it reaches the report.
export const POST: APIRoute = async (context) => {
  const headers = { "Cache-Control": "no-store" };
  const mediaType = (context.request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "text/plain") {
    return new Response(null, { status: 415, headers });
  }
  // A public route must not buffer an arbitrary body: a declared length over the limit is refused before reading, and
  // the stream is read only up to one byte past the limit.
  if (Number(context.request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers });
  }
  const bytes = await readAtMost(context.request, MAX_BODY_BYTES + 1);
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers });
  }
  const code = new TextDecoder().decode(bytes).trim();
  if (!(CLIENT_ERROR_CODES as readonly string[]).includes(code)) {
    return new Response(null, { status: 400, headers });
  }
  reportError(`client.sw.${code as ClientErrorCode}`, new Error(code), requestFields(context));
  return new Response(null, { status: 204, headers });
};
