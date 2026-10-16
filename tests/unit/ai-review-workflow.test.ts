import { describe, expect, it } from "vitest";
import { loadSteps, runStep, type GhFixture, type StepResult } from "../helpers/workflow-steps";

// The run: blocks of the ai-review gate, executed under gh and npm stubs (tests/helpers/workflow-steps.ts).
const WORKFLOW = ".github/workflows/review.yml";
const ACTION = ".github/actions/ai-reviewer/action.yml";
const REPO = "owner/repo";
const PR = "7";
const HEAD_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const RUN_URL = "https://github.com/owner/repo/actions/runs/1";
const MARKER = "<!-- ai-cr:summary -->";

describe("run blocks", () => {
  it("never interpolate an expression into the script; values reach it through env", () => {
    for (const file of [WORKFLOW, ACTION]) {
      for (const step of loadSteps(file)) {
        if (step.run !== undefined) expect(step.run, `${file}: ${step.name ?? "(unnamed)"}`).not.toContain("${{");
      }
    }
  });
});

describe("Choose review or re-evaluation", () => {
  const mode = (env: Record<string, string>) => runStep(WORKFLOW, "Choose review or re-evaluation", { env }).outputs;

  it("re-evaluates on any label but ai-cr:review, and reviews otherwise", () => {
    expect(mode({ EVENT_ACTION: "labeled", LABEL_NAME: "documentation" })).toEqual({ mode: "reevaluate" });
    expect(mode({ EVENT_ACTION: "labeled", LABEL_NAME: "ai-cr:review" })).toEqual({ mode: "review" });
    expect(mode({ EVENT_ACTION: "synchronize", LABEL_NAME: "" })).toEqual({ mode: "review" });
  });
});

describe("Re-evaluate the last review of this commit", () => {
  const endpoint = `repos/${REPO}/commits/${HEAD_SHA}/check-runs?check_name=ai-review&filter=all&status=completed&per_page=100`;
  const checkRun = (conclusion: string, completedAt: string, slug = "github-actions") => ({
    conclusion,
    completed_at: completedAt,
    app: { slug },
  });
  const reevaluate = (checkRuns: unknown[]) =>
    runStep(WORKFLOW, "Re-evaluate the last review of this commit", {
      env: { GH_TOKEN: "t", REPO, HEAD_SHA },
      gh: [{ endpoint, body: { check_runs: checkRuns } }],
    });

  it("keeps the newest success by completed_at, whatever the list order", () => {
    const result = reevaluate([
      checkRun("success", "2026-10-16T10:05:00Z"),
      checkRun("failure", "2026-10-16T10:00:00Z"),
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("passed; keeping that result");
  });

  it("copies the newest failure, ignoring a later cancelled run and runs of other apps", () => {
    const result = reevaluate([
      checkRun("failure", "2026-10-16T10:00:00Z"),
      checkRun("success", "2026-10-16T10:10:00Z", "some-other-app"),
      checkRun("cancelled", "2026-10-16T10:20:00Z"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("failed; this run copies that result");
  });

  it("fails and asks for ai-cr:review when there is no completed review", () => {
    const result = reevaluate([checkRun("cancelled", "2026-10-16T10:20:00Z")]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Add the ai-cr:review label to run the review.");
  });
});

describe("Comment and label", () => {
  const pulls: GhFixture = { endpoint: `repos/${REPO}/pulls/${PR}`, body: { head: { sha: HEAD_SHA } } };
  const created: GhFixture = {
    method: "POST",
    endpoint: `repos/${REPO}/issues/${PR}/comments`,
    body: { html_url: "https://github.com/c/1" },
  };
  const labels: GhFixture = {
    method: "POST",
    endpoint: `repos/${REPO}/issues/${PR}/labels`,
    body: [{ name: "ai-cr:passed" }],
  };
  const comments = (body: unknown[]): GhFixture => ({ endpoint: `repos/${REPO}/issues/${PR}/comments`, body });
  const criteria = { implementationCorrectness: { score: 8, rationale: "ok" } };

  function comment(
    outcome: string,
    options: { verdict?: string; summary?: string; gh?: GhFixture[]; reviewFile?: string } = {},
  ): StepResult {
    const review = JSON.stringify({ criteria, verdict: options.verdict, summary: options.summary ?? "Looks fine." });
    return runStep(WORKFLOW, "Comment and label", {
      files: { "review.json": options.reviewFile ?? review },
      env: (dir) => ({
        GH_TOKEN: "t",
        REPO,
        PR,
        HEAD_SHA,
        RUN_URL,
        OUTCOME: outcome,
        VERDICT: options.verdict ?? "",
        REVIEW_FILE: `${dir}/review.json`,
      }),
      gh: options.gh ?? [pulls, comments([]), created, labels],
    });
  }

  /** The body of the comment the step wrote (the --input of its POST or PATCH). */
  function writtenBody(result: StepResult): string {
    const write = result.gh.find((call) => call.endpoint.includes("comments") && call.method !== "GET");
    if (write?.input === undefined) throw new Error("no comment was written");
    return (JSON.parse(write.input) as { body: string }).body;
  }

  /** The label calls of the step, as `+label` (added) and `-label` (removed). */
  function labelCalls(result: StepResult): string[] {
    return result.gh.flatMap((call) => {
      if (call.method === "POST" && call.endpoint.endsWith("/labels")) {
        return (JSON.parse(call.input ?? "{}") as { labels: string[] }).labels.map((label) => `+${label}`);
      }
      if (call.method === "DELETE") return [`-${decodeURIComponent(call.endpoint.split("/labels/")[1])}`];
      return [];
    });
  }

  const footer = ["", "---", `Commit \`abcdef1\` · [run log](${RUN_URL})`, ""];

  it("posts a pass with the summary, neutralises mentions and comment openers, and labels ai-cr:passed", () => {
    const result = comment("reviewed", { verdict: "pass", summary: "Ping @team <!-- hidden -->" });
    expect(result.status).toBe(0);
    expect(writtenBody(result).split("\n")).toEqual([
      MARKER,
      "## AI code review: `pass`",
      "",
      "Ping @\u200bteam &lt;!-- hidden -->",
      ...footer,
    ]);
    expect(labelCalls(result)).toEqual(["+ai-cr:passed", "-ai-cr:failed"]);
  });

  it("labels a fail ai-cr:failed and removes ai-cr:passed", () => {
    const result = comment("reviewed", { verdict: "fail", summary: "Broken." });
    expect(writtenBody(result).split("\n").slice(0, 4)).toEqual([MARKER, "## AI code review: `fail`", "", "Broken."]);
    expect(labelCalls(result)).toEqual(["+ai-cr:failed", "-ai-cr:passed"]);
  });

  it("falls back to a fixed line when the review file cannot be read", () => {
    const result = comment("reviewed", { verdict: "pass", reviewFile: "not json" });
    expect(writtenBody(result)).toContain("_The review summary could not be read; see the run log._");
  });

  it("cuts a summary of 70,000 characters to 60,000 without splitting a surrogate pair", () => {
    const plain = comment("reviewed", { verdict: "pass", summary: "a".repeat(70_000) });
    const plainSummary = writtenBody(plain).split("\n## AI code review: `pass`\n\n")[1].split("\n\n[truncated]")[0];
    expect(plainSummary).toBe("a".repeat(60_000));

    const pair = comment("reviewed", {
      verdict: "pass",
      summary: `${"a".repeat(59_999)}\u{1F600}${"b".repeat(10_000)}`,
    });
    const body = writtenBody(pair);
    expect(body).toContain(`${"a".repeat(59_999)}\n\n[truncated]`);
    expect(body).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("explains a skipped review with the exclusions and removes both labels", () => {
    const result = comment("skipped");
    expect(writtenBody(result).split("\n")).toEqual([
      MARKER,
      "## AI code review: `skipped`",
      "",
      "No code diff to review after the exclusions (`context/`, `*.md`, `package-lock.json`, `packages/code-reviewer/evals/package-lock.json` and the eval cases `packages/code-reviewer/evals/cases/*.yaml`). The check passes.",
      ...footer,
    ]);
    expect(labelCalls(result)).toEqual(["-ai-cr:passed", "-ai-cr:failed"]);
  });

  it("explains a too-large diff and labels it ai-cr:failed", () => {
    const result = comment("too-large");
    expect(writtenBody(result).split("\n").slice(0, 4)).toEqual([
      MARKER,
      "## AI code review: `too-large`",
      "",
      "The code diff is over the reviewer's limit, so it was not reviewed and the check fails. Split the pull request, or see the break-glass procedure in the README (CI section).",
    ]);
    expect(labelCalls(result)).toEqual(["+ai-cr:failed", "-ai-cr:passed"]);
  });

  it("explains an unreviewable diff and labels it ai-cr:failed", () => {
    const result = comment("unreviewable");
    expect(writtenBody(result).split("\n").slice(0, 4)).toEqual([
      MARKER,
      "## AI code review: `unreviewable`",
      "",
      "The diff shows a source file as binary (usually a NUL byte in it), so the reviewer cannot read it and the check fails. Remove the byte, or, for a truly binary file type, add its extension to the reviewer's list (`BINARY_EXTENSIONS`) on `master` first (see the README, CI section). The paths are in the run log.",
    ]);
    expect(labelCalls(result)).toEqual(["+ai-cr:failed", "-ai-cr:passed"]);
  });

  it("reports an empty outcome as error and removes both labels", () => {
    const result = comment("");
    expect(writtenBody(result).split("\n").slice(0, 4)).toEqual([
      MARKER,
      "## AI code review: `error`",
      "",
      "The review did not complete (API, network, timeout or setup failure; see the run log), so the check fails. Add the `ai-cr:review` label to re-run it.",
    ]);
    expect(labelCalls(result)).toEqual(["-ai-cr:passed", "-ai-cr:failed"]);
  });

  it("writes nothing when the PR head has moved on", () => {
    const moved: GhFixture = { endpoint: `repos/${REPO}/pulls/${PR}`, body: { head: { sha: "1234567" } } };
    const result = comment("reviewed", { verdict: "pass", gh: [moved, comments([]), created, labels] });
    expect(result.status).toBe(0);
    expect(result.gh).toEqual([{ method: "GET", endpoint: `repos/${REPO}/pulls/${PR}` }]);
  });

  it("edits the bot's marked comment instead of creating another, and ignores other authors", () => {
    const existing = [
      { id: 11, user: { login: "someone" }, body: `${MARKER}\n## AI code review: \`fail\`` },
      { id: 22, user: { login: "github-actions[bot]" }, body: `${MARKER}\n## AI code review: \`fail\`\n\nOld.` },
    ];
    const patch: GhFixture = {
      method: "PATCH",
      endpoint: `repos/${REPO}/issues/comments/22`,
      body: { html_url: "https://github.com/c/22" },
    };
    const result = comment("reviewed", { verdict: "pass", gh: [pulls, comments(existing), patch, labels] });
    expect(result.status).toBe(0);
    expect(
      result.gh.filter((call) => call.method === "PATCH" || call.method === "POST").map((c) => c.endpoint),
    ).toEqual([`repos/${REPO}/issues/comments/22`, `repos/${REPO}/issues/${PR}/labels`]);
  });

  it("creates its own comment when the bot's only marked comment has another second line", () => {
    // claude-review comments as the same bot; a comment of it that starts with the marker is not taken over.
    const existing = [
      { id: 33, user: { login: "github-actions[bot]" }, body: `${MARKER}\n## Claude review\n\nNotes.` },
    ];
    const result = comment("reviewed", { verdict: "pass", gh: [pulls, comments(existing), created, labels] });
    expect(result.status).toBe(0);
    expect(result.gh.some((call) => call.method === "PATCH")).toBe(false);
    expect(result.gh.filter((call) => call.method === "POST").map((c) => c.endpoint)).toEqual([
      `repos/${REPO}/issues/${PR}/comments`,
      `repos/${REPO}/issues/${PR}/labels`,
    ]);
  });

  it("still writes the labels when the comment write fails, then fails the step", () => {
    const failing: GhFixture = { ...created, status: 502 };
    const result = comment("reviewed", { verdict: "fail", gh: [pulls, comments([]), failing, labels] });
    expect(result.status).toBe(1);
    expect(labelCalls(result)).toEqual(["+ai-cr:failed", "-ai-cr:passed"]);
  });
});

describe("Gate on the outcome", () => {
  const gate = (OUTCOME: string, VERDICT = "") =>
    runStep(WORKFLOW, "Gate on the outcome", { env: { OUTCOME, VERDICT } });

  it("passes only a reviewed pass and a skipped review", () => {
    expect(gate("reviewed", "pass").status).toBe(0);
    expect(gate("skipped").status).toBe(0);
    const failing: [string, string?][] = [["reviewed", "fail"], ["too-large"], ["unreviewable"], ["error"], [""]];
    for (const [outcome, verdict] of failing) {
      expect(gate(outcome, verdict).status, `${outcome}:${verdict ?? ""}`).toBe(1);
    }
  });
});

describe("ai-reviewer action", () => {
  it("reports a whitespace-only diff as skipped without running npm", () => {
    const result = runStep(ACTION, "Resolve the reviewer root and check the diff", { diff: " \n\t\n" });
    expect(result.status).toBe(0);
    expect(result.outputs.skip).toBe("true");
    expect(result.outputs.outcome).toBe("skipped");
    expect(result.npm).toEqual([]);
    expect(result.summary).toContain("Outcome: `skipped` (the diff is empty)");
  });

  it("goes on with a non-empty diff and resolves the root to an absolute path", () => {
    const result = runStep(ACTION, "Resolve the reviewer root and check the diff", { diff: "diff --git a/x b/x\n" });
    expect(result.outputs.skip).toBe("false");
    expect(result.outputs.outcome).toBeUndefined();
    expect(result.outputs.root).toMatch(/^\/.*reviewer-root$/);
  });

  const review = {
    criteria: { implementationCorrectness: { score: 8 }, securitySafety: { score: 9 } },
    verdict: "pass",
    summary: "ok",
  };
  const runReviewer = (status: number, stdout = "", stderr = "") =>
    runStep(ACTION, "Run the reviewer", {
      diff: "diff --git a/x b/x\n",
      env: { OPENROUTER_API_KEY: "unused", REVIEWER_MODEL: "", PR_TITLE: "t", PR_BODY: "" },
      npm: { status, stdout, stderr },
    });

  it("maps exit 0 with a valid verdict to reviewed, with the verdict, the review file and the scores", () => {
    const usage =
      "model=z-ai/glm-5.1 finishReason=stop input_tokens=1 output_tokens=1 total_tokens=2 cost_usd=0.01 tool_calls=0";
    const note = "note: the model said pass and the score rule says fail; the stricter verdict, fail, binds";
    const result = runReviewer(0, JSON.stringify(review), `${usage}\n${note}\n`);
    expect(result.status).toBe(0);
    expect(result.npm).toEqual([["run", "--silent", "review"]]);
    expect(result.outputs).toEqual({
      outcome: "reviewed",
      verdict: "pass",
      "review-file": `${result.runnerTemp}/ai-review.json`,
    });
    expect(result.summary).toContain("Scores: implementationCorrectness 8, securitySafety 9");
    expect(result.summary).toContain(usage);
    expect(result.summary).toContain(note);
  });

  it("maps exit 0 without a valid verdict, and exit 1, to error", () => {
    expect(runReviewer(0, "not json").outputs).toEqual({ outcome: "error" });
    expect(runReviewer(0, JSON.stringify({ ...review, verdict: "maybe" })).outputs).toEqual({ outcome: "error" });
    expect(runReviewer(1, "", "error: upstream 502\n").outputs).toEqual({ outcome: "error" });
  });

  it("maps exit 2 to skipped, exit 3 to too-large and exit 4 to unreviewable", () => {
    expect(runReviewer(2).outputs).toEqual({ outcome: "skipped" });
    expect(runReviewer(3).outputs).toEqual({ outcome: "too-large" });
    expect(runReviewer(4).outputs).toEqual({ outcome: "unreviewable" });
  });
});
