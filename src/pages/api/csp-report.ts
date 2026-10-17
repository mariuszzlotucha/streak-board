import type { APIRoute } from "astro";
import { reportInfo } from "@/lib/log";

export const prerender = false;

// A browser report is a few hundred bytes; the limit leaves room for a batch of them.
const MAX_BODY_BYTES = 8192;
// The longest value a logged field keeps.
const MAX_FIELD_LENGTH = 200;
const MEDIA_TYPES = ["application/csp-report", "application/reports+json"];

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

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

// The blocked resource as an origin or a keyword: a full URL can carry a query with personal data.
export function normalizeBlocked(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "inline" || raw === "eval" || raw === "data") return raw;
  if (raw.startsWith("data:")) return "data";
  try {
    const url = new URL(raw);
    return url.origin === "null" ? url.protocol.replace(/:$/, "").slice(0, MAX_FIELD_LENGTH) : text(url.origin);
  } catch {
    return "";
  }
}

// The document's path only, without the query and the hash.
export function normalizePath(value: unknown): string {
  try {
    return text(new URL(typeof value === "string" ? value : "").pathname);
  } catch {
    return "";
  }
}

interface Violation {
  directive: string;
  blocked: string;
  path: string;
}

function fromLegacy(body: unknown): Violation[] {
  const report = (body as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"];
  if (!report || typeof report !== "object") return [];
  return [
    {
      directive: text(report["effective-directive"] ?? report["violated-directive"]),
      blocked: normalizeBlocked(report["blocked-uri"]),
      path: normalizePath(report["document-uri"]),
    },
  ];
}

function fromReportingApi(body: unknown): Violation[] {
  if (!Array.isArray(body)) return [];
  return body
    .filter((entry): entry is { type: string; body: Record<string, unknown> } => {
      const candidate = entry as { type?: unknown; body?: unknown } | null;
      return candidate?.type === "csp-violation" && typeof candidate.body === "object" && candidate.body !== null;
    })
    .map(({ body: report }) => ({
      directive: text(report.effectiveDirective),
      blocked: normalizeBlocked(report.blockedURL),
      path: normalizePath(report.documentURL),
    }));
}

// Public on purpose: browsers send CSP reports without credentials, from any page of the site. Only the normalized
// directive, blocked origin and path reach the log; full URLs, the script sample and the request headers do not.
export const POST: APIRoute = async (context) => {
  const headers = { "Cache-Control": "no-store" };
  const mediaType = (context.request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!MEDIA_TYPES.includes(mediaType)) {
    return new Response(null, { status: 415, headers });
  }
  if (Number(context.request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers });
  }
  const bytes = await readAtMost(context.request, MAX_BODY_BYTES + 1);
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers });
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response(null, { status: 400, headers });
  }
  const violations = mediaType === "application/csp-report" ? fromLegacy(body) : fromReportingApi(body);
  for (const violation of violations) {
    reportInfo("csp.violation", { ...violation });
  }
  return new Response(null, { status: 204, headers });
};
