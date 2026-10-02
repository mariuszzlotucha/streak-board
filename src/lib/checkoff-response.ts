import type { APIContext } from "astro";
import type { CheckoffOutcome } from "@/lib/checkoffs";
import { wantsJson as acceptsJson } from "@/lib/http";

/** What a check-off or undo route decided: the data layer's outcome, or one of the failures it finds before that. */
export type CheckoffResult = CheckoffOutcome | { kind: "invalid" | "not_configured" | "gone" };

// The JSON `error` code is the result kind. The redirect reuses the dashboard's error codes; a task that is not
// visible to the caller (already deleted, other group) ends quietly on the dashboard, like Join and Leave.
const FAILURES: Record<Exclude<CheckoffResult["kind"], "ok">, { status: number; redirect: string }> = {
  invalid: { status: 400, redirect: "/dashboard?error=forbidden" },
  not_configured: { status: 503, redirect: "/dashboard?error=not_configured" },
  gone: { status: 404, redirect: "/dashboard" },
  forbidden: { status: 403, redirect: "/dashboard?error=forbidden" },
  unknown: { status: 500, redirect: "/dashboard?error=unknown" },
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** A plain form POST gets a redirect; a `fetch` that asks for `application/json` gets a JSON answer it can act on. */
export function checkoffResponse(context: APIContext, result: CheckoffResult): Response {
  const wantsJson = acceptsJson(context.request.headers);
  if (result.kind === "ok") {
    return wantsJson ? jsonResponse(200, { ok: true, period: result.period }) : context.redirect("/dashboard");
  }
  const failure = FAILURES[result.kind];
  return wantsJson
    ? jsonResponse(failure.status, { ok: false, error: result.kind })
    : context.redirect(failure.redirect);
}
