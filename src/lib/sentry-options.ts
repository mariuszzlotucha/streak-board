import { linkedErrorsIntegration, type CloudflareOptions, type ErrorEvent } from "@sentry/cloudflare";
import { scrubSecrets } from "@/lib/redact";

/** The Worker bindings the SDK options read; `SENTRY_DSN` is a Worker secret, the rest are config vars and bindings. */
export interface SentryEnv {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  CF_VERSION_METADATA?: { id?: string };
}

// Module-level so a test can pin that the list is exactly this one integration.
const integrations = [linkedErrorsIntegration()];

/** Keeps `user.id` only and removes what the SDK or the request wrapper adds that must not leave the Worker. */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.user) {
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }
  if (event.contexts) {
    delete event.contexts.culture;
    delete event.contexts.cloud_resource;
  }
  return JSON.parse(scrubSecrets(JSON.stringify(event))) as T;
}

/**
 * SDK options with the data collection locked down: no default integrations (HttpServer would read POST bodies, which
 * hold passwords and the invite code), every `dataCollection` flag off and a `beforeSend` scrubber.
 */
export function sentryOptions(env: SentryEnv): CloudflareOptions {
  const release = env.SENTRY_RELEASE ?? env.CF_VERSION_METADATA?.id;
  return {
    dsn: env.SENTRY_DSN,
    ...(release ? { release } : {}),
    ...(env.SENTRY_ENVIRONMENT ? { environment: env.SENTRY_ENVIRONMENT } : {}),
    defaultIntegrations: false,
    integrations,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    beforeSend: scrubEvent,
  };
}
