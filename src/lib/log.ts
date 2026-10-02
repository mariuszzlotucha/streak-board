import { scrubSecrets } from "@/lib/redact";

export type ReportContext = {
  route?: string;
  userId?: string | null;
  ray?: string | null;
  status?: number | null;
} & Record<string, string | number | boolean | null | undefined>;

const MAX_TEXT = 500;
const MAX_STACK = 2000;

interface ErrorFields {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  stack?: string;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return scrubSecrets(value).slice(0, max);
}

function plain(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function errorFields(error: unknown): ErrorFields {
  const candidates: ErrorFields = {};
  if (error instanceof Error) {
    candidates.name = plain(error.name);
    candidates.message = text(error.message, MAX_TEXT);
    candidates.stack = text(error.stack, MAX_STACK);
  } else if (typeof error === "object" && error !== null) {
    candidates.message = text((error as Record<string, unknown>).message, MAX_TEXT);
  } else {
    candidates.message = text(String(error), MAX_TEXT);
  }
  if (typeof error === "object" && error !== null) {
    // PostgrestError extends Error, so details and hint are read for every object.
    const { code, status, details, hint } = error as Record<string, unknown>;
    candidates.details = text(details, MAX_TEXT);
    candidates.hint = text(hint, MAX_TEXT);
    candidates.code = plain(code);
    if (typeof status === "number") candidates.status = status;
  }
  // Only what is known goes into the logged object.
  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined));
}

// The helpers run inside `if (error)` branches and `catch` blocks, where a throw would turn a handled redirect into a
// 500, so they never throw.
function safely(event: string, write: () => void): void {
  try {
    write();
  } catch {
    // eslint-disable-next-line no-console -- last resort when the structured report itself fails
    console.error("report.failed", event);
  }
}

/* eslint-disable no-console -- this file is the one place that writes server-side logs */

/** One structured error line: the event, the request ids and the cause with its code and status. */
export function reportError(event: string, error: unknown, context: ReportContext = {}): void {
  safely(event, () => {
    console.error({ level: "error", event, ...context, error: errorFields(error) });
  });
}

/** One structured info line for an expected-but-notable outcome (a stale request, a rate limit). */
export function reportInfo(event: string, context: ReportContext = {}): void {
  safely(event, () => {
    console.info({ level: "info", event, ...context });
  });
}

/* eslint-enable no-console */

/**
 * The policy for a returned Supabase error that a route mapped to a user-facing code: `unknown` and `forbidden` are
 * failures, `rate_limited` is worth an info line, every other code is a domain outcome and stays quiet.
 */
export function reportMapped(event: string, code: string, error: unknown, context: ReportContext = {}): void {
  if (code === "unknown" || code === "forbidden") {
    reportError(event, error, { ...context, outcome: code });
  } else if (code === "rate_limited") {
    safely(event, () => {
      reportInfo(event, { ...context, outcome: code, code: errorFields(error).code });
    });
  }
}

/** The ids every report of a request carries; never an e-mail, cookie, body or invite code. */
export function requestFields(context: {
  request: Request;
  routePattern: string;
  locals: { user?: { id: string } | null };
}): ReportContext {
  return {
    route: context.routePattern,
    userId: context.locals.user?.id ?? null,
    ray: context.request.headers.get("cf-ray"),
  };
}
