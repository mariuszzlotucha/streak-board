import { env } from "cloudflare:workers";
import { setAsyncLocalStorageAsyncContextStrategy, withScope } from "@sentry/cloudflare";
import { wrapRequestHandler } from "@sentry/cloudflare/request";
import { sentryOptions } from "@/lib/sentry-options";

// The request wrapper does not install the async-context strategy, so scopes would leak between concurrent requests.
setAsyncLocalStorageAsyncContextStrategy();

type WrapperContext = Parameters<typeof wrapRequestHandler>[0]["context"];

/**
 * Runs one request inside the SDK's request wrapper, so reports made anywhere in the request have a client and a scope
 * and events are flushed after the response. With no `SENTRY_DSN` the SDK has no transport and sends nothing. This is
 * the only module that imports `cloudflare:workers` and `@sentry/cloudflare/request`.
 */
export function runWithSentry(
  context: { request: Request; locals: { cfContext?: unknown } },
  handler: () => Promise<Response>,
): Promise<Response> {
  return withScope(() =>
    wrapRequestHandler(
      {
        options: sentryOptions(env),
        request: context.request,
        context: context.locals.cfContext as WrapperContext,
      },
      handler,
    ),
  );
}
