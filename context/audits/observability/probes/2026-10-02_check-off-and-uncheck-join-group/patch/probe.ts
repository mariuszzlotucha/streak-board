// PROBE-ONLY endpoint, injected into the isolated copy by the runtime-probe harness (probe/suite.mjs).
// It exists to show how failure shapes that are NOT in the audited flows reach the platform logs. Never ship it.
import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export const prerender = false;

const handler: APIRoute = async (context) => {
  const mode = context.url.searchParams.get("mode");
  const cfContext = (context.locals as unknown as { cfContext: { waitUntil(promise: Promise<unknown>): void } })
    .cfContext;

  switch (mode) {
    // P1: an exception escapes the handler (nothing in this route catches it).
    case "throw":
      throw new Error("probe-handler");
    // P1b: same, but the error has a `cause`.
    case "throw-cause":
      throw new Error("probe-handler", { cause: new Error("probe-cause") });
    // P1c: a non-Error is thrown (supabase-js throws plain PostgREST error objects in this app).
    case "throw-plain":
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw { code: "XX000", message: "probe plain object thrown", details: "d", hint: null };
    // P4: a 500 is returned, nothing is thrown.
    case "return500":
      return new Response("probe-500", { status: 500 });
    // P7: a floating promise rejects after the handler returned 200.
    case "reject":
      void Promise.reject(new Error("probe-reject"));
      return new Response("probe-reject-fired", { status: 200 });
    // P8: a background task registered with waitUntil fails after the response.
    case "waituntil-fail":
      cfContext.waitUntil(Promise.reject(new Error("probe-waituntil")));
      return new Response("probe-waituntil-fired", { status: 200 });
    // P9: how workerd prints an Error with a cause, a plain PostgREST-shaped object and a template string.
    case "log-error":
      console.error("probe label", new Error("probe-error", { cause: new Error("probe-cause") }));
      return new Response("logged", { status: 200 });
    case "log-error-only":
      console.error(new Error("probe-error-only"));
      return new Response("logged", { status: 200 });
    case "log-plain":
      console.error("probe label", { message: "m", details: "d", hint: null, code: "XX000" });
      return new Response("logged", { status: 200 });
    case "log-string": {
      const failure = new Error("probe-string", { cause: new Error("probe-cause") });
      console.error(`probe label ${failure}`);
      return new Response("logged", { status: 200 });
    }
    case "log-json":
      console.error("probe label", JSON.stringify(new Error("probe-json", { cause: new Error("probe-cause") })));
      return new Response("logged", { status: 200 });
    // P12 helper: are the Supabase secrets visible to the Worker? (booleans only, never the values)
    case "env":
      return Response.json({ urlSet: Boolean(SUPABASE_URL), keySet: Boolean(SUPABASE_KEY) });
    default:
      return new Response("probe: unknown mode", { status: 400 });
  }
};

export const GET = handler;
export const POST = handler;
