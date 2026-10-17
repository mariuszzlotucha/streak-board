import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RepoContext } from "../../packages/code-reviewer/tools";

// The reviewer builds its model with `openrouter(...)`; each test sets the mock it answers with.
let model: MockLanguageModelV4;
vi.mock("@openrouter/ai-sdk-provider", () => ({ openrouter: () => model }));
// A fixed fence suffix (8 hex characters, "abababab"), so the prompt's tags can be matched in full.
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomBytes: (size: number) => Buffer.alloc(size, 0xab),
}));
const SUFFIX = "abababab";

const { reviewDiff, ReviewRunError, UnreviewableDiffError } = await import("../../packages/code-reviewer/agent");

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const criterion = { score: 8, rationale: "fine" };
const review = {
  criteria: {
    implementationCorrectness: criterion,
    idiomaticity: criterion,
    complexity: criterion,
    testRiskCoverage: criterion,
    documentation: criterion,
    securitySafety: criterion,
  },
  verdict: "pass",
  summary: "**pass** — fine.\n\n### Findings\nNone.",
};
const answer = {
  content: [{ type: "text" as const, text: JSON.stringify(review) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
};
const readClaudeMd = {
  content: [
    {
      type: "tool-call" as const,
      toolCallId: "c1",
      toolName: "readFile",
      input: JSON.stringify({ path: "CLAUDE.md", revision: "base" }),
    },
  ],
  finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
  usage,
  warnings: [],
};

let dir: string;
let repo: RepoContext;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "reviewer-agent-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "CLAUDE.md"), "# Rules\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "head");
  repo = { cwd: dir, baseSha: git("rev-parse", "HEAD~1"), headSha: git("rev-parse", "HEAD") };
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("reviewDiff without a repo", () => {
  it("makes one call with no tools", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const run = await reviewDiff("+x\n");
    expect(run.output.verdict).toBe("pass");
    expect(run.toolCalls).toEqual([]);
    expect(run.toolsSkipped).toBe(false);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].tools ?? []).toEqual([]);
  });
});

const notes = {
  content: [{ type: "text" as const, text: "Notes: nothing outside the hunk is affected." }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
};

describe("reviewDiff with a repo", () => {
  it("gathers evidence with tools and no schema, then answers with the schema and no tools", async () => {
    model = new MockLanguageModelV4({ doGenerate: [readClaudeMd, answer] });
    const run = await reviewDiff("+export const a = 1;\n", { repo, maxSteps: 2 });

    expect(run.output.verdict).toBe("pass");
    expect(model.doGenerateCalls).toHaveLength(2);
    const [evidence, final] = model.doGenerateCalls;
    const result = "CLAUDE.md at base (1 lines):\n1: # Rules";
    expect(run.toolCalls).toEqual([{ tool: "readFile", revision: "base", target: "CLAUDE.md", chars: result.length }]);
    // GLM-5.1 skipped the tools whenever the request carried a JSON schema, so the evidence calls carry none.
    expect(evidence.tools?.map((t) => t.name).sort()).toEqual(["readFile", "searchCode"]);
    expect(evidence.responseFormat?.type ?? "text").toBe("text");
    expect(final.tools ?? []).toEqual([]);
    expect(final.responseFormat?.type).toBe("json");
    expect(JSON.stringify(evidence.prompt)).toContain(
      `<changed-files-${SUFFIX}>\\nA a.ts\\n</changed-files-${SUFFIX}>`,
    );
    expect(JSON.stringify(evidence.prompt)).toContain("You can read the repository");
    expect(JSON.stringify(final.prompt)).toContain(JSON.stringify(result).slice(1, -1));
    expect(JSON.stringify(final.prompt)).toContain("The evidence phase is over");
    expect(run.usage.inputTokens).toBe(20);
  });

  it("answers with the schema after an evidence phase that ended in notes", async () => {
    model = new MockLanguageModelV4({ doGenerate: [notes, answer] });
    const run = await reviewDiff("+x\n", { repo, maxSteps: 6 });
    expect(run.output.verdict).toBe("pass");
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain("Notes: nothing outside the hunk");
  });

  it("wraps an API error after a billed tool step, keeping the tool log and the cause", async () => {
    const apiError = new Error("upstream 502");
    let callNumber = 0;
    model = new MockLanguageModelV4({
      doGenerate: () => {
        callNumber++;
        if (callNumber === 1) return Promise.resolve(readClaudeMd);
        return Promise.reject(apiError);
      },
    });
    const error = await reviewDiff("+x\n", { repo, maxSteps: 3 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReviewRunError);
    expect((error as InstanceType<typeof ReviewRunError>).toolCalls.map((c) => c.target)).toEqual(["CLAUDE.md"]);
    expect((error as Error).cause).toBe(apiError);
  });

  it("starts no further evidence step once the phase deadline has passed", async () => {
    model = new MockLanguageModelV4({ doGenerate: [readClaudeMd, answer] });
    const start = Date.now();
    // The clock jumps past EVIDENCE_PHASE_MS as soon as the first evidence step has run.
    const now = vi
      .spyOn(Date, "now")
      .mockImplementation(() => (model.doGenerateCalls.length > 0 ? start + 200_000 : start));
    try {
      await reviewDiff("+x\n", { repo, maxSteps: 6 });
    } finally {
      now.mockRestore();
    }
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[1].responseFormat?.type).toBe("json");
  });

  it("reviews a diff over maxDiffCharsForTools without tools, still listing the changed files", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const run = await reviewDiff("+0123456789\n", { repo, maxDiffCharsForTools: 5 });
    expect(run.toolsSkipped).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].tools ?? []).toEqual([]);
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(`<changed-files-${SUFFIX}>\\nA a.ts\\n`);
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).not.toContain("You can read the repository");
  });

  it("makes a single structured call without tools when maxSteps is 1", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    await reviewDiff("+x\n", { repo, maxSteps: 1 });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].tools ?? []).toEqual([]);
    expect(model.doGenerateCalls[0].responseFormat?.type).toBe("json");
  });
});

describe("reviewDiff on a diff that shows a file as binary", () => {
  const marker = (a: string, b: string) => `diff --git a/x b/x\nBinary files ${a} and ${b} differ\n`;

  it("throws UnreviewableDiffError with the paths of a source file before any model call", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const error = await reviewDiff(`+x\n${marker("a/src/x.ts", "b/src/x.ts")}`, { repo }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnreviewableDiffError);
    expect((error as InstanceType<typeof UnreviewableDiffError>).paths).toEqual(["a/src/x.ts", "b/src/x.ts"]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("reviews a new image and an upper-case binary extension as usual", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    await reviewDiff(`${marker("/dev/null", "b/logo.png")}${marker("a/IMG.PNG", "b/IMG.PNG")}`);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("rejects a quoted path that ends in .ts after the closing quote is dropped", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const quoted = '"b/caf\\303\\251.ts"';
    const error = await reviewDiff(marker("/dev/null", quoted)).catch((e: unknown) => e);
    expect((error as InstanceType<typeof UnreviewableDiffError>).paths).toEqual([quoted]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("rejects a name holding ' and ' unless every split at ' and ' leaves binary sides", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const error = await reviewDiff(marker("a/fish and chips.png", "b/fish and chips.png")).catch((e: unknown) => e);
    expect((error as InstanceType<typeof UnreviewableDiffError>).paths).toEqual(["a/fish and chips.png and b/fish"]);
    await reviewDiff(marker("a/before.png and after.png", "b/before.png and after.png"));
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("rejects a name that splits into a binary side and /dev/null, before any model call", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const error = await reviewDiff(marker("/dev/null", "b/img.png and /dev/null")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnreviewableDiffError);
    expect((error as InstanceType<typeof UnreviewableDiffError>).paths).toEqual(["b/img.png and /dev/null"]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("reads a raw path holding U+2028 like any other", async () => {
    model = new MockLanguageModelV4({ doGenerate: answer });
    const path = "src/x y.ts";
    const error = await reviewDiff(marker(`a/${path}`, `b/${path}`)).catch((e: unknown) => e);
    expect((error as InstanceType<typeof UnreviewableDiffError>).paths).toEqual([`a/${path}`, `b/${path}`]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("the CLI and the session demo on a diff that shows a source file as binary", () => {
  it.each(["review.ts", "review-with-session.ts"])(
    "%s exits 4 with empty stdout and the paths on stderr, without an API key",
    (script) => {
      const root = join(import.meta.dirname, "../..");
      // Unset, not empty: the OpenRouter provider sends a request with an empty key.
      const { OPENROUTER_API_KEY: _key, REVIEW_BASE_REF: _base, REVIEW_HEAD_REF: _head, ...env } = process.env;
      const result = spawnSync(
        join(root, "node_modules/.bin/tsx"),
        [join(root, "packages/code-reviewer", script)],
        // A directory without a .env, which both scripts would load.
        { cwd: dir, env, input: "diff --git a/x.ts b/x.ts\nBinary files a/x.ts and b/x.ts differ\n", encoding: "utf8" },
      );
      expect(result.status).toBe(4);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/^error: .*\["a\/x\.ts","b\/x\.ts"\]$/m);
    },
  );
});
