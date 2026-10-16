/**
 * `tsx report.ts <results.json>` (`npm run report -- results/<file>.json` in this
 * folder): turns one promptfoo JSON result file into a Markdown report on
 * stdout. It reads only that file and makes no model call.
 *
 * - Per case and provider label: passed runs, verdict counts, model↔rule
 *   disagreements both ways, mean latency, peak reasoning tokens and cost;
 *   totals per provider below.
 * - With providers `old` and `new`: the suspect cases, where `new` passed fewer
 *   runs than `old`, each with the command that re-runs it alone ×5. One run of
 *   difference at ×3 is often noise; a regression is confirmed only when `new`
 *   passes fewer runs in the re-run too.
 * - Runs at or above 75% of `DEFAULT_MAX_OUTPUT_TOKENS` in reasoning tokens,
 *   and the runs that ended in an error.
 * - The verdict criterion per provider: A = runs of `expect: pass` cases with
 *   model `fail` and rule `pass`; B = the same for `expect: fail` cases; `rule`
 *   when B = 0 and A ≥ 1, otherwise `stricter`. Runs without a verdict
 *   (`too-large`, `unreviewable`, an error) count in neither. Next to it, the
 *   agreement with `expect` under today's binding (the stricter verdict) and
 *   under the score rule alone, both from the recorded verdicts.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "../config";
import type { CaseOutput } from "./provider";

/** Reasoning tokens from which a run is flagged: 75% of the per-call ceiling (24,576 at 32,768). */
const REASONING_FLAG = Math.floor(DEFAULT_MAX_OUTPUT_TOKENS * 0.75);

/** One run as read from the result file. */
interface Run {
  description: string;
  expect: string | undefined;
  provider: string;
  success: boolean;
  latencyMs: number | undefined;
  cost: number | undefined;
  output: Partial<CaseOutput> | undefined;
  error: string | undefined;
}

/** The parts of a promptfoo result row this report reads. */
interface ResultRow {
  provider?: { id?: string; label?: string };
  testCase?: { description?: string; metadata?: { expect?: string } };
  success?: boolean;
  latencyMs?: number;
  cost?: number;
  error?: string;
  response?: { output?: unknown; error?: string; cost?: number };
}

/** The runs of a promptfoo JSON result file (`results.results[]`). */
export function readRuns(json: unknown): Run[] {
  const rows = (json as { results?: { results?: ResultRow[] } } | undefined)?.results?.results;
  if (!Array.isArray(rows)) throw new Error("not a promptfoo result file: results.results is missing");
  return rows.map((row) => {
    const output = row.response?.output;
    return {
      description: row.testCase?.description ?? "(no description)",
      expect: row.testCase?.metadata?.expect,
      provider: row.provider?.label ?? row.provider?.id ?? "(no provider)",
      success: row.success === true,
      latencyMs: row.latencyMs,
      cost: row.cost ?? row.response?.cost,
      output: typeof output === "object" && output !== null ? output : undefined,
      error: row.response?.error ?? row.error,
    };
  });
}

/** Whether a run produced a review with both verdicts. */
function reviewed(run: Run): boolean {
  return run.output?.outcome === "reviewed" && run.output.modelVerdict != null && run.output.ruleVerdict != null;
}

/** Groups `items` by `key`, keeping the order of first appearance. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    const group = groups.get(name);
    if (group) group.push(item);
    else groups.set(name, [item]);
  }
  return groups;
}

/** Table cell text: `|` escaped, newlines flattened. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/** Counts and sums over a set of runs, as one table row shows them. */
function summarise(runs: readonly Run[]) {
  const count = (test: (run: Run) => boolean) => runs.filter(test).length;
  const latencies = runs.map((run) => run.latencyMs).filter((value): value is number => typeof value === "number");
  const reasoning = runs
    .map((run) => run.output?.reasoningTokens)
    .filter((value): value is number => typeof value === "number");
  return {
    passed: count((run) => run.success),
    runs: runs.length,
    pass: count((run) => run.output?.verdict === "pass"),
    fail: count((run) => run.output?.verdict === "fail"),
    tooLarge: count((run) => run.output?.outcome === "too-large"),
    unreviewable: count((run) => run.output?.outcome === "unreviewable"),
    errors: count((run) => run.output === undefined),
    modelFailRulePass: count(
      (run) => reviewed(run) && run.output?.modelVerdict === "fail" && run.output.ruleVerdict === "pass",
    ),
    modelPassRuleFail: count(
      (run) => reviewed(run) && run.output?.modelVerdict === "pass" && run.output.ruleVerdict === "fail",
    ),
    meanLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : undefined,
    maxReasoning: reasoning.length ? Math.max(...reasoning) : undefined,
    cost: runs.reduce((total, run) => total + (run.cost ?? 0), 0),
  };
}

const TABLE_HEADER = [
  "| Case | Provider | Passed | Verdicts (pass/fail/too-large/unreviewable/error) | model fail, rule pass | model pass, rule fail | Mean latency | Max reasoning | Cost |",
  "| ---- | -------- | ------ | ------------------------------------------------- | --------------------- | --------------------- | ------------ | ------------- | ---- |",
];

function tableRow(caseName: string, provider: string, runs: readonly Run[]): string {
  const s = summarise(runs);
  const latency = s.meanLatencyMs === undefined ? "–" : `${(s.meanLatencyMs / 1000).toFixed(1)} s`;
  return [
    "",
    cell(caseName),
    cell(provider),
    `${s.passed}/${s.runs}`,
    `${s.pass}/${s.fail}/${s.tooLarge}/${s.unreviewable}/${s.errors}`,
    String(s.modelFailRulePass),
    String(s.modelPassRuleFail),
    latency,
    s.maxReasoning === undefined ? "–" : String(s.maxReasoning),
    formatCost(s.cost),
    "",
  ]
    .join(" | ")
    .trim();
}

/** A pattern for `--filter-pattern` that matches exactly this description, single-quoted for the shell. */
function filterArgument(description: string): string {
  const pattern = `^${description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
  return `'${pattern.replace(/'/g, "'\\''")}'`;
}

/** The criterion counts of one provider's runs. */
function criterion(runs: readonly Run[]) {
  const modelOnlyFail = (run: Run) =>
    reviewed(run) && run.output?.modelVerdict === "fail" && run.output.ruleVerdict === "pass";
  const a = runs.filter((run) => run.expect === "pass" && modelOnlyFail(run)).length;
  const b = runs.filter((run) => run.expect === "fail" && modelOnlyFail(run)).length;
  const withVerdict = runs.filter((run) => reviewed(run) && run.expect !== undefined);
  return {
    a,
    b,
    binding: b === 0 && a >= 1 ? "rule" : "stricter",
    stricterAgrees: withVerdict.filter((run) => run.output?.verdict === run.expect).length,
    ruleAgrees: withVerdict.filter((run) => run.output?.ruleVerdict === run.expect).length,
    withVerdict: withVerdict.length,
  };
}

/** The whole Markdown report for the runs of one result file. */
export function renderReport(runs: readonly Run[]): string {
  const lines: string[] = ["# Code reviewer eval report", ""];
  const byProvider = groupBy(runs, (run) => run.provider);
  const byCase = groupBy(runs, (run) => run.description);

  lines.push("## Cases", "", ...TABLE_HEADER);
  for (const [description, caseRuns] of byCase) {
    for (const [provider, providerRuns] of groupBy(caseRuns, (run) => run.provider)) {
      lines.push(tableRow(description, provider, providerRuns));
    }
  }
  lines.push("", "## Totals per provider", "", ...TABLE_HEADER);
  for (const [provider, providerRuns] of byProvider) lines.push(tableRow("all cases", provider, providerRuns));

  if (byProvider.has("old") && byProvider.has("new")) {
    lines.push("", "## Old against new", "");
    const suspects: string[] = [];
    for (const [description, caseRuns] of byCase) {
      const passed = (provider: string) => caseRuns.filter((run) => run.provider === provider && run.success).length;
      if (passed("new") < passed("old")) suspects.push(description);
    }
    if (suspects.length === 0) {
      lines.push("No suspect case: `new` passed at least as many runs as `old` on every case.");
    } else {
      lines.push(
        "Suspect cases (`new` passed fewer runs than `old`). One run of difference at ×3 is often noise: re-run each",
        "case alone ×5 on both providers; it is a regression only when `new` passes fewer runs again.",
        "",
      );
      for (const description of suspects) {
        lines.push(
          `- ${description}`,
          "",
          "  ```sh",
          `  npm run --prefix packages/code-reviewer/evals compare -- --repeat 5 --filter-pattern ${filterArgument(description)}`,
          "  ```",
          "",
        );
      }
    }
  }

  const heavy = runs.filter((run) => (run.output?.reasoningTokens ?? 0) >= REASONING_FLAG);
  lines.push("", `## Runs at or above ${REASONING_FLAG} reasoning tokens`, "");
  if (heavy.length === 0) lines.push("None.");
  for (const run of heavy) {
    lines.push(
      `- ${run.description} (${run.provider}): ${run.output?.reasoningTokens} reasoning tokens, finishReason ${run.output?.finishReason ?? "unknown"}`,
    );
  }

  const failed = runs.filter((run) => run.output === undefined);
  lines.push("", "## Runs without an output", "");
  if (failed.length === 0) lines.push("None.");
  for (const run of failed) lines.push(`- ${run.description} (${run.provider}): ${cell(run.error ?? "no error text")}`);

  lines.push(
    "",
    "## Verdict criterion",
    "",
    "A: runs of `expect: pass` cases where only the model said fail. B: the same for `expect: fail` cases.",
    "Agreement with `expect` counts the runs with a verdict, under the stricter verdict (today's binding) and under",
    "the score rule alone.",
    "",
    "| Provider | A | B | Binding | Agreement, stricter | Agreement, rule alone |",
    "| -------- | - | - | ------- | ------------------- | --------------------- |",
  );
  for (const [provider, providerRuns] of byProvider) {
    const c = criterion(providerRuns);
    lines.push(
      `| ${cell(provider)} | ${c.a} | ${c.b} | ${c.binding} | ${c.stricterAgrees}/${c.withVerdict} | ${c.ruleAgrees}/${c.withVerdict} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Reads the file named on the command line and prints its report. */
function main(): number {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx report.ts <promptfoo results.json>");
    return 2;
  }
  console.log(renderReport(readRuns(JSON.parse(readFileSync(file, "utf8")))));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
