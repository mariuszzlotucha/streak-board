import { env } from "cloudflare:workers";
import { setAsyncLocalStorageAsyncContextStrategy, withScope, withSentry } from "@sentry/cloudflare";
import { wrapRequestHandler } from "@sentry/cloudflare/request";
import { sentryOptions, type SentryEnv } from "@/lib/sentry-options";

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

/** The parts of the Worker's `ScheduledController` the scheduled wrapper reads (the repo has no workers types). */
export interface ScheduledControllerLike {
  cron: string;
  scheduledTime: number;
}

/** The parts of the Worker's `ExecutionContext` the scheduled wrapper uses. */
export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

/**
 * Runs one cron invocation inside the SDK's scheduled instrumentation, with the same options as requests: its own
 * isolation scope and client, an uncaught error captured, and the events flushed through `ctx.waitUntil`. The fetch
 * handler is not wrapped here; requests keep `runWithSentry` in the middleware.
 */
export function runScheduledWithSentry(
  controller: ScheduledControllerLike,
  workerEnv: SentryEnv,
  ctx: WaitUntilContext,
  fn: () => Promise<unknown>,
): Promise<void> {
  const handler = withSentry((e: SentryEnv) => sentryOptions(e), {
    async scheduled() {
      await fn();
    },
  } as Parameters<typeof withSentry>[1]);
  return Promise.resolve(
    (handler as unknown as { scheduled: (c: unknown, e: unknown, x: unknown) => unknown }).scheduled(
      controller,
      workerEnv,
      ctx,
    ),
  ).then(() => undefined);
}
