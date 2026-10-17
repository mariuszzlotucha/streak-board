import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, toReportOnly, withSecurityHeaders } from "@/lib/security-headers";

// The header lines of one rule in public/_headers: the indented lines under `path`, up to the next blank line.
function headersRule(path: string): [string, string][] {
  const lines = readFileSync("public/_headers", "utf8").split("\n");
  const start = lines.indexOf(path);
  expect(start).toBeGreaterThanOrEqual(0);
  const rule: [string, string][] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    const colon = line.indexOf(":");
    rule.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rule;
}

describe("withSecurityHeaders", () => {
  it("sets the four headers", () => {
    const response = withSecurityHeaders(new Response("page"));

    for (const [name, value] of SECURITY_HEADERS) expect(response.headers.get(name)).toBe(value);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("copies a response whose headers are immutable and keeps its status and location", () => {
    const original = Response.redirect("http://localhost/auth/signin", 302);
    expect(() => {
      original.headers.set("X-Test", "1");
    }).toThrow();

    const response = withSecurityHeaders(original);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost/auth/signin");
    for (const [name, value] of SECURITY_HEADERS) expect(response.headers.get(name)).toBe(value);
  });

  it("does not overwrite a header the response already set", () => {
    const response = withSecurityHeaders(new Response("page", { headers: { "X-Frame-Options": "SAMEORIGIN" } }));

    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("toReportOnly", () => {
  const policy = "default-src 'self'; form-action 'self' http://127.0.0.1:54321";

  it("moves the page's policy to the Report-Only header and leaves no enforced one", () => {
    const response = toReportOnly(new Response("page", { headers: { "Content-Security-Policy": policy } }));

    expect(response.headers.get("content-security-policy-report-only")).toBe(policy);
    expect(response.headers.has("content-security-policy")).toBe(false);
  });

  it("leaves a response without a policy as it is", () => {
    const original = Response.redirect("http://localhost/auth/signin", 302);

    expect(toReportOnly(original)).toBe(original);
    expect(original.headers.has("content-security-policy-report-only")).toBe(false);
  });

  it("copies a response whose headers are immutable", async () => {
    const fetched = new Response("page", { status: 200, headers: { "Content-Security-Policy": policy } });
    Object.defineProperty(fetched, "headers", { value: new Proxy(fetched.headers, immutable) });

    const response = toReportOnly(fetched);

    expect(response).not.toBe(fetched);
    expect(response.headers.get("content-security-policy-report-only")).toBe(policy);
    expect(response.headers.has("content-security-policy")).toBe(false);
    expect(await response.text()).toBe("page");
  });
});

// Headers whose writes throw, as on a fetched response.
const immutable: ProxyHandler<Headers> = {
  get(target, key) {
    if (key === "set" || key === "delete" || key === "append") {
      return () => {
        throw new TypeError("immutable");
      };
    }
    const value = Reflect.get(target, key, target) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
  },
};

describe("public/_headers", () => {
  it("gives static files the same headers as SECURITY_HEADERS, without Cache-Control", () => {
    expect(headersRule("/*")).toEqual(SECURITY_HEADERS.map(([name, value]) => [name, value]));
  });
});
