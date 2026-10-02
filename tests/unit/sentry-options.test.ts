import type { ErrorEvent } from "@sentry/cloudflare";
import { describe, expect, it } from "vitest";
import { scrubEvent, sentryOptions } from "@/lib/sentry-options";

describe("sentryOptions", () => {
  it("turns off every default integration and keeps only the linked-errors one", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://key@example.invalid/1" });

    expect(options.defaultIntegrations).toBe(false);
    expect(options.integrations).toHaveLength(1);
    expect((options.integrations as { name: string }[])[0].name).toBe("LinkedErrors");
  });

  it("turns every data collection flag off and collects no body", () => {
    expect(sentryOptions({}).dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
  });

  it("sets no tracing options and scrubs through beforeSend", () => {
    const options = sentryOptions({});

    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("tracesSampler");
    expect(options.beforeSend).toBe(scrubEvent);
  });

  it("takes the release from SENTRY_RELEASE before the version metadata id", () => {
    expect(sentryOptions({ SENTRY_RELEASE: "r1", CF_VERSION_METADATA: { id: "v1" } }).release).toBe("r1");
    expect(sentryOptions({ CF_VERSION_METADATA: { id: "v1" } }).release).toBe("v1");
  });

  it("leaves release and environment out when they are missing", () => {
    const options = sentryOptions({});

    expect(options).not.toHaveProperty("release");
    expect(options).not.toHaveProperty("environment");
    expect(sentryOptions({ SENTRY_ENVIRONMENT: "local" }).environment).toBe("local");
  });
});

describe("scrubEvent", () => {
  const fixture = (): ErrorEvent =>
    ({
      message: "Key (join_code)=(abc123) already exists.",
      exception: { values: [{ type: "Error", value: "failed for jane@example.com at /join/abc123?x=1" }] },
      user: { id: "u1", email: "jane@example.com", ip_address: "203.0.113.7", username: "jane" },
      contexts: { culture: { locale: "pl-PL" }, cloud_resource: { "cloud.provider": "cloudflare" }, trace: { a: 1 } },
      tags: { event: "x.failed" },
    }) as unknown as ErrorEvent;

  it("removes key values, invite codes and e-mail addresses from the serialised event", () => {
    const serialised = JSON.stringify(scrubEvent(fixture()));

    expect(serialised).not.toContain("abc123");
    expect(serialised).not.toContain("jane@example.com");
    expect(serialised).toContain("Key (join_code)=(…)");
    expect(serialised).toContain("/join/[code]");
  });

  it("keeps only user.id and deletes the culture and cloud_resource contexts", () => {
    const event = scrubEvent(fixture());

    expect(event.user).toEqual({ id: "u1" });
    expect(event.contexts).toEqual({ trace: { a: 1 } });
    expect(event.tags).toEqual({ event: "x.failed" });
  });

  it("returns an event without user or contexts unchanged", () => {
    expect(scrubEvent({ message: "plain" } as ErrorEvent)).toEqual({ message: "plain" });
  });
});
