import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Astro does not hash an `is:inline` script, so astro.config.mjs lists the hash of ClearErrorParam's script by hand.
// Astro emits the script's text unchanged between the tags; a change to it without a new hash would be a violation.
describe("security.csp.scriptDirective.hashes", () => {
  it("holds the SHA-256 of the inline script in ClearErrorParam.astro", () => {
    const source = readFileSync("src/components/site/ClearErrorParam.astro", "utf8");
    const script = /<script is:inline>([\s\S]*?)<\/script>/.exec(source);
    expect(script).not.toBeNull();
    const hash = `sha256-${createHash("sha256")
      .update(script?.[1] ?? "")
      .digest("base64")}`;

    const config = readFileSync("astro.config.mjs", "utf8");
    const hashes = /hashes:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    expect(hashes).toContain(`"${hash}"`);
  });
});
