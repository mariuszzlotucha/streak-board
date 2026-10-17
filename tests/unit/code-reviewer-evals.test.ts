import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import ReviewerProvider, { buildCaseInput, CI_DIFF_PATHSPECS } from "../../packages/code-reviewer/evals/provider";
import { readRuns, renderReport } from "../../packages/code-reviewer/evals/report";

const REPO_ROOT = join(import.meta.dirname, "../..");
const EVALS = join(REPO_ROOT, "packages/code-reviewer/evals");
const CASES = join(EVALS, "cases");

interface Assertion {
  type: string;
  value?: unknown;
  transform?: string;
}

interface Case {
  description: string;
  metadata: { kind: string; expect: string };
  vars: Record<string, unknown>;
  assert: Assertion[];
}

/** Every case file, parsed. */
function loadCases(): { file: string; cases: unknown }[] {
  return readdirSync(CASES).map((file) => ({ file, cases: parse(readFileSync(join(CASES, file), "utf8")) as unknown }));
}

// No test here may reach a model: without a key the OpenRouter provider fails locally instead of sending a request.
let savedKey: string | undefined;
beforeAll(() => {
  savedKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});
afterAll(() => {
  if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
});

describe("the eval cases", () => {
  it("are YAML files only, each a one-item list with metadata, one input form and a javascript assertion", () => {
    const files = readdirSync(CASES);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/\.yaml$/);
    for (const { file, cases } of loadCases()) {
      expect(Array.isArray(cases), file).toBe(true);
      expect(cases, file).toHaveLength(1);
      const [testCase] = cases as Case[];
      expect(typeof testCase.description, file).toBe("string");
      expect(["regression", "bug", "injection"], file).toContain(testCase.metadata.kind);
      expect(["pass", "fail"], file).toContain(testCase.metadata.expect);
      const { base, head, files: caseFiles } = testCase.vars;
      const commits = typeof base === "string" && typeof head === "string";
      const fileInput = typeof caseFiles === "object" && caseFiles !== null && "head" in caseFiles;
      expect(commits !== fileInput, `${file}: base/head commits or files, not both`).toBe(true);
      expect(
        testCase.assert.some((assertion) => assertion.type === "javascript"),
        file,
      ).toBe(true);
      for (const assertion of testCase.assert.filter((a) => a.type === "llm-rubric")) {
        expect(assertion.transform, file).toBe("output.summary");
      }
    }
  });
});

describe("ReviewerProvider", () => {
  it("does no I/O in the constructor, so a missing reviewer root does not throw", () => {
    expect(() => new ReviewerProvider({ config: { reviewerRoot: "/nonexistent" } })).not.toThrow();
  });

  it("builds a non-empty diff for every case and reaches reviewDiff, which stops at the size cap", async () => {
    const provider = new ReviewerProvider({ config: { maxDiffChars: 1 } });
    for (const { file, cases } of loadCases()) {
      const [testCase] = cases as Case[];
      const response = await provider.callApi("code review case", { vars: testCase.vars });
      expect(response.error, file).toBeUndefined();
      expect(response.output?.outcome, file).toBe("too-large");
      expect(response.output?.diffChars, file).toBeGreaterThan(1);
    }
  });
});

describe("ReviewerProvider on a file hidden as binary", () => {
  it("reports the nul-hidden case as unreviewable with the paths git printed, before any model call", async () => {
    const [testCase] = parse(readFileSync(join(CASES, "nul-hidden.yaml"), "utf8")) as Case[];
    const response = await new ReviewerProvider().callApi("code review case", { vars: testCase.vars });
    expect(response.error).toBeUndefined();
    expect(response.output?.outcome).toBe("unreviewable");
    expect(response.output?.paths).toEqual(["a/src/lib/redirect.ts", "b/src/lib/redirect.ts"]);
  });
});

describe("buildCaseInput", () => {
  it("leaves out exactly the gate's exclusions, shows a NUL file as binary and removes its repository", async () => {
    const added = [
      "context/x.md",
      "docs/a.md",
      "package-lock.json",
      "packages/code-reviewer/evals/package-lock.json",
      "packages/code-reviewer/evals/cases/c.yaml",
      "packages/code-reviewer/evals/cases/evil.ts",
      "src/xpackage-lock.json",
      "src/a.ts",
    ];
    const head: Record<string, string | null> = Object.fromEntries(added.map((path) => [path, `${path}\n`]));
    head["src/b.ts"] = "export const b = 1; // \u0000\n";
    head["src/gone.ts"] = null;
    const input = await buildCaseInput({ files: { base: { "src/gone.ts": "old\n" }, head } }, REPO_ROOT);
    try {
      const paths = [...input.diff.matchAll(/^diff --git a\/(\S+) b\//gm)].map((match) => match[1]).sort();
      expect(paths).toEqual([
        "packages/code-reviewer/evals/cases/evil.ts",
        "src/a.ts",
        "src/b.ts",
        "src/gone.ts",
        "src/xpackage-lock.json",
      ]);
      expect(input.diff).toContain("Binary files /dev/null and b/src/b.ts differ");
      expect(input.diff).toContain("deleted file mode");
      expect(input.cwd).not.toBe(REPO_ROOT);
    } finally {
      await input.cleanup();
    }
    expect(existsSync(input.cwd)).toBe(false);
  });

  it("rejects a file path that leaves the repository", async () => {
    await expect(buildCaseInput({ files: { base: {}, head: { "../x.ts": "x\n" } } }, REPO_ROOT)).rejects.toThrow(
      /repo-relative/,
    );
  });

  it("rejects a file path inside .git, which would rewrite the temporary repository's config", async () => {
    for (const path of [".git/config", "sub/.GIT/hooks/pre-commit"]) {
      await expect(buildCaseInput({ files: { base: { [path]: "x\n" }, head: {} } }, REPO_ROOT), path).rejects.toThrow(
        /inside \.git/,
      );
    }
  });

  it("rejects base and head that are not full commit SHAs, so no value reaches git as an option", async () => {
    const sha = "0".repeat(40);
    const pairs: [string, string][] = [
      ["--output=/dev/null", sha],
      [sha, "HEAD"],
      [sha.slice(0, 7), sha],
    ];
    for (const [base, head] of pairs) {
      await expect(buildCaseInput({ base, head }, REPO_ROOT), `${base} ${head}`).rejects.toThrow(/full 40-character/);
    }
  });

  it("rejects files together with base or head, so neither input wins silently", async () => {
    const sha = "0".repeat(40);
    const files = { base: {}, head: { "src/a.ts": "a\n" } };
    for (const vars of [
      { files, base: sha, head: sha },
      { files, base: sha },
      { files, head: sha },
    ]) {
      await expect(buildCaseInput(vars, REPO_ROOT), Object.keys(vars).join(" ")).rejects.toThrow(/not both/);
    }
  });
});

describe("CI_DIFF_PATHSPECS", () => {
  it("is the pathspec of the gate's Compute the code diff step", () => {
    const workflow = parse(readFileSync(join(REPO_ROOT, ".github/workflows/review.yml"), "utf8")) as {
      jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
    };
    const step = workflow.jobs["ai-review"].steps.find((s) => s.name === "Compute the code diff");
    const line = step?.run?.split("\n").find((l) => l.startsWith("git diff "));
    const pathspec = line?.split(" -- . ")[1]?.split(" > ")[0];
    expect(pathspec && [...pathspec.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([...CI_DIFF_PATHSPECS]);
  });
});

describe("the promptfoo configs", () => {
  it("set the repeat count in evaluateOptions, 3, 3 and 1, never at the top level", () => {
    const repeats = ["promptfooconfig.yaml", "promptfooconfig.compare.yaml", "promptfooconfig.models.yaml"].map(
      (file) => {
        const config = parse(readFileSync(join(EVALS, file), "utf8")) as {
          repeat?: unknown;
          evaluateOptions?: { repeat?: unknown };
        };
        expect(config.repeat, file).toBeUndefined();
        return config.evaluateOptions?.repeat;
      },
    );
    expect(repeats).toEqual([3, 3, 1]);
  });
});

describe("report.ts", () => {
  const verdicts = (modelVerdict: string, ruleVerdict: string) => ({
    outcome: "reviewed",
    verdict: modelVerdict === "fail" || ruleVerdict === "fail" ? "fail" : "pass",
    modelVerdict,
    ruleVerdict,
  });
  const row = (description: string, expected: string, label: string, success: boolean, output?: unknown) => ({
    provider: { id: "file://provider.ts", label },
    testCase: { description, metadata: { expect: expected } },
    success,
    latencyMs: 1000,
    cost: 0.01,
    ...(output === undefined ? { error: "ReviewRunError: boom" } : { response: { output } }),
  });
  // new: A = 1 (`accepted`, a fail from the model alone), B = 0; old: A = 0, B = 1 (`flawed`). `slipped` is a suspect.
  const resultFile = {
    results: {
      results: [
        row("accepted", "pass", "new", false, verdicts("fail", "pass")),
        row("accepted", "pass", "new", true, verdicts("pass", "pass")),
        row("accepted", "pass", "old", false),
        row("flawed", "fail", "new", true, verdicts("fail", "fail")),
        row("flawed", "fail", "new", true, { outcome: "unreviewable", paths: ["a/x.ts"] }),
        row("flawed", "fail", "old", true, verdicts("fail", "pass")),
        row("slipped", "pass", "new", false, verdicts("fail", "fail")),
        row("slipped", "pass", "old", true, verdicts("pass", "pass")),
      ],
    },
  };

  it("counts A and B over the runs with a verdict and gives the binding per provider", () => {
    const report = renderReport(readRuns(resultFile));
    expect(report).toContain("| new | 1 | 0 | rule | 2/4 | 3/4 |");
    expect(report).toContain("| old | 0 | 1 | stricter | 2/2 | 1/2 |");
  });

  it("lists the suspect case with its re-run command and the run without a response", () => {
    const report = renderReport(readRuns(resultFile));
    expect(report).toContain("compare -- --repeat 5 --filter-pattern '^slipped$'");
    expect(report).not.toMatch(/^- (accepted|flawed)$/m);
    expect(report).toContain("- accepted (old): ReviewRunError: boom");
  });

  it("refuses a file that is not a promptfoo result", () => {
    expect(() => readRuns({})).toThrow(/results\.results is missing/);
  });
});
