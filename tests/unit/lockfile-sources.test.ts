import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../..");
const REGISTRY = "https://registry.npmjs.org/";

interface LockEntry {
  resolved?: string;
  integrity?: string;
  link?: boolean;
  inBundle?: boolean;
}

// The ai-review gate leaves both lockfiles out of its diff (.github/workflows/review.yml), so this test is what
// checks where their packages come from: the npm registry, each one pinned by an integrity hash.
describe.each(["package-lock.json", "packages/code-reviewer/evals/package-lock.json"])("%s", (file) => {
  it("installs every package from the npm registry with an integrity hash", () => {
    const lock = JSON.parse(readFileSync(join(REPO_ROOT, file), "utf8")) as { packages: Record<string, LockEntry> };
    // A link points into this repository, and a bundled package comes inside its parent, whose hash covers it.
    const entries = Object.entries(lock.packages).filter(
      ([path, entry]) => path !== "" && entry.link !== true && entry.inBundle !== true,
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter(([, entry]) => !entry.resolved?.startsWith(REGISTRY)).map(([path]) => path)).toEqual([]);
    expect(entries.filter(([, entry]) => !entry.integrity).map(([path]) => path)).toEqual([]);
  });
});
