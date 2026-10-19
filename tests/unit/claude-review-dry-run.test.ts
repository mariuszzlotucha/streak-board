// Oracle for the dry-run checks of the Claude review prompt (scripts/claude-review-dry-run.mjs), from the plan of
// `claude-review-publish`: the summary must have the documented shape (marker, `## Claude review: <VERDICT>`, a Commit line,
// no ai-review marker, no bare EOF line), a denied `gh pr comment` is fatal and any other denial a warning.
import { describe, expect, it } from "vitest";
import { checkSummaryBody, classifyDenials, parseArgs, parseStream } from "../../scripts/claude-review-dry-run.mjs";

const TEMPLATE = [
  "<!-- claude-review:summary -->",
  "## Claude review: APPROVED",
  "",
  "Commit 1a2b3c4. One to three sentences on why this verdict.",
  "",
  "### Findings",
  "",
  "None.",
].join("\n");

describe("checkSummaryBody", () => {
  it("accepts the template body", () => {
    expect(checkSummaryBody(TEMPLATE)).toEqual([]);
  });

  it("rejects an HTML heading on line 2", () => {
    const body = TEMPLATE.replace("## Claude review: APPROVED", "<h2>Claude review: APPROVED</h2>");
    expect(checkSummaryBody(body)).not.toEqual([]);
  });

  it("rejects a body without the marker", () => {
    expect(checkSummaryBody(TEMPLATE.split("\n").slice(1).join("\n"))).not.toEqual([]);
  });

  it("rejects a line that is only EOF", () => {
    expect(checkSummaryBody(`${TEMPLATE}\nEOF\nmore`)).not.toEqual([]);
  });

  it("rejects the ai-review marker anywhere", () => {
    expect(checkSummaryBody(`${TEMPLATE}\n<!-- ai-cr:summary -->`)).not.toEqual([]);
  });

  it("rejects a verdict other than the three allowed, and two verdicts", () => {
    expect(checkSummaryBody(TEMPLATE.replace("APPROVED", "MAYBE"))).not.toEqual([]);
    expect(checkSummaryBody(TEMPLATE.replace("APPROVED", "NEEDS ATTENTION -> APPROVED"))).not.toEqual([]);
  });

  it("rejects a body without a Commit line", () => {
    expect(checkSummaryBody(TEMPLATE.replace("Commit 1a2b3c4.", "Commit abc."))).not.toEqual([]);
  });
});

describe("classifyDenials", () => {
  it("marks a denied gh pr comment fatal and anything else a warning", () => {
    const comment = { toolName: "Bash", command: "gh pr comment 205 --body '<!-- x -->\n## Claude review: APPROVED'" };
    const sed = { toolName: "Bash", command: "sed -n 1p x" };
    expect(classifyDenials([comment, sed])).toEqual({ fatal: [comment], warnings: [sed] });
  });
});

describe("parseStream", () => {
  it("reads the result line and a permission_denied line", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "gh pr view 205" } },
            { type: "tool_use", id: "toolu_2", name: "Bash", input: { command: "sed -n 1p x" } },
          ],
        },
      }),
      JSON.stringify({
        type: "system",
        subtype: "permission_denied",
        tool_name: "Bash",
        tool_use_id: "toolu_2",
        decision_reason: "not allowed",
      }),
      "not json",
      JSON.stringify({
        type: "result",
        num_turns: 7,
        total_cost_usd: 0.42,
        permission_denials: [{ tool_name: "Bash", tool_use_id: "toolu_2", tool_input: { command: "sed -n 1p x" } }],
      }),
    ];
    expect(parseStream(lines)).toEqual({
      result: {
        numTurns: 7,
        costUsd: 0.42,
        denials: [{ toolUseId: "toolu_2", toolName: "Bash", command: "sed -n 1p x" }],
      },
      permissionDenied: [{ toolUseId: "toolu_2", toolName: "Bash", command: "sed -n 1p x", reason: "not allowed" }],
      tools: ["Bash"],
    });
  });

  it("returns a null result for an empty stream", () => {
    expect(parseStream([""]).result).toBeNull();
  });
});

describe("parseArgs", () => {
  it("reads the PR number and the options", () => {
    expect(parseArgs(["205", "--model", "m", "--max-turns", "9", "--claude", "npx -y x"])).toEqual({
      pr: 205,
      model: "m",
      maxTurns: 9,
      claude: "npx -y x",
    });
  });

  it("applies the defaults", () => {
    expect(parseArgs(["12"])).toEqual({ pr: 12, model: "claude-opus-5-5", maxTurns: 40, claude: "claude" });
  });

  it("rejects a non-numeric or zero --max-turns and an unknown argument", () => {
    expect(() => parseArgs(["205", "--max-turns", "abc"])).toThrow(/max-turns/);
    expect(() => parseArgs(["205", "--max-turns", "0"])).toThrow(/max-turns/);
    expect(() => parseArgs(["205", "--bogus"])).toThrow(/unexpected/);
  });

  it("rejects a missing PR number", () => {
    expect(() => parseArgs([])).toThrow(/PR number/);
    expect(() => parseArgs(["--model", "m"])).toThrow(/PR number/);
  });
});
