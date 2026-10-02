import { describe, expect, it } from "vitest";
import { scrubSecrets } from "@/lib/redact";

describe("scrubSecrets", () => {
  it("masks an e-mail address alone and inside a sentence", () => {
    expect(scrubSecrets("jane.doe+x@example.co.uk")).toBe("[email]");
    expect(scrubSecrets("Email address jane@example.com is not authorized")).toBe(
      "Email address [email] is not authorized",
    );
  });

  it("masks the value of a single and a compound Key fragment", () => {
    expect(scrubSecrets("Key (join_code)=(abc123) already exists.")).toBe("Key (join_code)=(…) already exists.");
    expect(scrubSecrets("Key (group_id, user_id)=(g1, u1) is not present in table")).toBe(
      "Key (group_id, user_id)=(…) is not present in table",
    );
  });

  it("masks the invite code in a join path", () => {
    expect(scrubSecrets("/join/abc123")).toBe("/join/[code]");
    expect(scrubSecrets("/join/abc123?x=1")).toBe("/join/[code]?x=1");
    expect(scrubSecrets("/join/abc123/")).toBe("/join/[code]/");
    expect(scrubSecrets('GET "https://app.test/join/abc123#frag" failed')).toBe(
      'GET "https://app.test/join/[code]#frag" failed',
    );
  });

  it("is idempotent", () => {
    const once = scrubSecrets("a@b.io Key (c)=(d) /join/xyz");
    expect(scrubSecrets(once)).toBe(once);
  });

  it("returns text without secrets unchanged", () => {
    expect(scrubSecrets("duplicate key value violates unique constraint")).toBe(
      "duplicate key value violates unique constraint",
    );
  });
});
