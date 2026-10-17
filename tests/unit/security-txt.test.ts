import { afterEach, describe, expect, it, vi } from "vitest";
import { contactEmail } from "@/lib/site";
import { securityTxt } from "@/lib/security-txt";
import { GET } from "@/pages/.well-known/security.txt";
import type { APIContext } from "astro";

vi.mock("@/lib/site", () => ({ contactEmail: vi.fn() }));

afterEach(() => {
  vi.mocked(contactEmail).mockReset();
});

describe("securityTxt", () => {
  it("builds the RFC 9116 lines with Expires one year after the build", () => {
    expect(securityTxt("ops@example.com", new Date("2026-10-17T12:00:00.000Z"))).toBe(
      [
        "Contact: mailto:ops@example.com",
        "Expires: 2027-10-17T12:00:00.000Z",
        "Preferred-Languages: pl, en",
        "Canonical: https://streakboard.app/.well-known/security.txt",
        "",
      ].join("\n"),
    );
  });
});

describe("GET /.well-known/security.txt", () => {
  it("serves the file as plain text with the contact address", async () => {
    vi.mocked(contactEmail).mockReturnValue("ops@example.com");

    const response = await GET({} as APIContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toContain("Contact: mailto:ops@example.com\n");
  });

  it("answers 404 without a contact address", async () => {
    vi.mocked(contactEmail).mockReturnValue(null);

    const response = await GET({} as APIContext);

    expect(response.status).toBe(404);
  });
});
