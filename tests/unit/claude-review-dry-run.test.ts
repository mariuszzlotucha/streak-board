// Oracle for the dry-run checks of the Claude review prompt (scripts/claude-review-dry-run.mjs), from the plan of
// `claude-review-publish`: the summary must have the documented shape (marker, `## Claude review: <VERDICT>`, a Commit line,
// no ai-review marker, no bare EOF line, no @ mention and no link outside code), a denied `gh pr comment` is fatal and any other denial a warning.
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  GH_WRAPPER,
  MAX_COMMENT_CHARS,
  checkSummaryBody,
  classifyDenials,
  mergeDenials,
  parseArgs,
  parseStream,
} from "../../scripts/claude-review-dry-run.mjs";

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

  it("accepts a scoped package, an e-mail address and a path in code, and rejects the same text in prose", () => {
    expect(checkSummaryBody(`${TEMPLATE}\n\nThe \`@astrojs/react\` island is unchanged.`)).toEqual([]);
    expect(
      checkSummaryBody(`${TEMPLATE}\n\n\`\`\`json\n{ "@scope/pkg": "https://example.com", "a": "[x](y)" }\n\`\`\``),
    ).toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nWrite to dev@example.com.`)).toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nThe @astrojs/react island is unchanged.`)).not.toEqual([]);
  });

  it("rejects an @ mention", () => {
    expect(checkSummaryBody(`${TEMPLATE}\n\nThanks @octocat.`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\n@octocat should look at this.`)).not.toEqual([]);
  });

  it("rejects a link, bare or in Markdown, whatever its case, a www address or an HTML anchor", () => {
    expect(checkSummaryBody(`${TEMPLATE}\n\nSee https://example.com.`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nSee [x](y).`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nSee HTTPS://EXAMPLE.COM.`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nSee www.example.com.`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nSee <a href="x">y</a>.`)).not.toEqual([]);
  });

  it("ends a code span at a run of the same length inside its paragraph, so a stray backtick hides nothing", () => {
    expect(checkSummaryBody(`${TEMPLATE}\n\nUse \` here. @octocat please.\n\nAnother \` stray`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\na \`\`\` b @bob \` c`)).not.toEqual([]);
    expect(checkSummaryBody(`${TEMPLATE}\n\nThe \`\`a \` b\`\` span and \`@scope/pkg\`.`)).toEqual([]);
  });

  it("rejects a body over GitHub's comment limit without scanning it", () => {
    expect(checkSummaryBody(`${TEMPLATE}\n\n${"`".repeat(MAX_COMMENT_CHARS)}`)).toEqual([
      `longer than GitHub's ${MAX_COMMENT_CHARS}-character comment limit`,
    ]);
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
        isError: false,
        subtype: null,
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

describe("parseStream edge cases", () => {
  it("leaves the command empty for a denial without a matching tool_use", () => {
    const lines = [
      JSON.stringify({
        type: "system",
        subtype: "permission_denied",
        tool_name: "Bash",
        tool_use_id: "x",
        decision_reason: "r",
      }),
    ];
    expect(parseStream(lines).permissionDenied).toEqual([
      { toolUseId: "x", toolName: "Bash", command: "", reason: "r" },
    ]);
  });

  it("reads a result without permission_denials, with its error flag and subtype", () => {
    const lines = [JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true })];
    expect(parseStream(lines).result).toEqual({
      numTurns: null,
      costUsd: null,
      isError: true,
      subtype: "error_max_turns",
      denials: [],
    });
  });

  it("skips lines that are not JSON objects", () => {
    expect(parseStream(["123", "null", "[]", "{"]).result).toBeNull();
  });
});

describe("parseArgs edge cases", () => {
  it("rejects an option without a value and a second PR number", () => {
    expect(() => parseArgs(["205", "--model"])).toThrow(/needs a value/);
    expect(() => parseArgs(["205", "206"])).toThrow(/unexpected/);
  });
});

describe("classifyDenials edge cases", () => {
  it("treats a command with leading whitespace as gh pr comment and a missing command as a warning", () => {
    const { fatal, warnings } = classifyDenials([{ command: "  gh pr comment 1 --body x" }, { toolName: "Write" }]);
    expect(fatal).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });
});

describe("mergeDenials", () => {
  it("attaches the reason by tool_use_id and adds a denial only the system message reported", () => {
    const resultDenials = [{ toolUseId: "a", toolName: "Bash", command: "sed -n 1p x" }];
    const permissionDenied = [
      { toolUseId: "a", toolName: "Bash", command: "sed -n 1p x", reason: "not allowed" },
      { toolUseId: "b", toolName: "Bash", command: "gh pr comment 1 --body x", reason: "newline" },
    ];
    expect(mergeDenials(resultDenials, permissionDenied)).toEqual([
      { toolUseId: "a", toolName: "Bash", command: "sed -n 1p x", reason: "not allowed" },
      { toolUseId: "b", toolName: "Bash", command: "gh pr comment 1 --body x", reason: "newline" },
    ]);
  });

  it("does not pair denials that both lack an id", () => {
    const merged = mergeDenials(
      [{ toolUseId: "", toolName: "Bash", command: "one" }],
      [{ toolUseId: "", toolName: "Bash", command: "two", reason: "r" }],
    );
    expect(merged).toEqual([
      { toolUseId: "", toolName: "Bash", command: "one", reason: "" },
      { toolUseId: "", toolName: "Bash", command: "two", reason: "r" },
    ]);
  });
});

describe("the generated gh wrapper", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dry-run-wrapper-test-"));
  const wrapper = path.join(dir, "gh");
  const realGh = path.join(dir, "real-gh");
  const log = path.join(dir, "comments.jsonl");
  writeFileSync(wrapper, GH_WRAPPER);
  writeFileSync(realGh, '#!/usr/bin/env node\nconsole.log("real:" + process.argv.slice(2).join(" "));\n');
  chmodSync(realGh, 0o755);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args: string[], input = "") {
    writeFileSync(log, "");
    const result = spawnSync(process.execPath, [wrapper, ...args], {
      input,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_REVIEW_DRY_RUN_LOG: log,
        CLAUDE_REVIEW_DRY_RUN_REPO: "owner/repo",
        CLAUDE_REVIEW_DRY_RUN_REAL_GH: realGh,
      },
    });
    const recorded = readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as unknown);
    return { ...result, recorded };
  }

  it.each([
    ["--body-file -", ["pr", "comment", "5", "--body-file", "-"]],
    ["--body-file=-", ["pr", "comment", "5", "--body-file=-"]],
    ["-F -", ["pr", "comment", "5", "-F", "-"]],
  ])("records the body from stdin for %s and posts nothing", (_name, args) => {
    const body = "<!-- claude-review:summary -->\n## Claude review: APPROVED\n";
    const result = run(args, body);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("/pull/5#issuecomment-dry-run");
    expect(result.recorded).toEqual([{ argv: args, stdin: body, error: null }]);
  });

  it("records a --body call without a body from stdin", () => {
    const result = run(["pr", "comment", "5", "--body", "text"]);
    expect(result.status).toBe(0);
    expect(result.recorded).toEqual([{ argv: ["pr", "comment", "5", "--body", "text"], stdin: null, error: null }]);
  });

  it("passes pr view and pr diff to the real gh", () => {
    const result = run(["pr", "view", "5", "--json", "title"]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("real:pr view 5 --json title");
    expect(result.recorded).toEqual([]);
  });

  it.each([[["pr", "review", "5", "--approve"]], [["api", "repos/owner/repo"]], [["pr", "edit", "5"]]])(
    "refuses %j with exit 2 and never reaches the real gh",
    (args) => {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("not available in the dry run");
      expect(result.recorded).toEqual([]);
    },
  );
});
