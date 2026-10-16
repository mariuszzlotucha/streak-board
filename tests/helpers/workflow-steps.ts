/**
 * Runs one `run:` block of a GitHub workflow or composite action under stubs,
 * so its shell logic can be tested without GitHub. The step is found by
 * `name`, written to a script and run with the shell GitHub uses: `bash -e`
 * for a workflow step without `shell:`, `bash --noprofile --norc -eo pipefail`
 * for a composite-action step with `shell: bash`. Step `if:` conditions are
 * not evaluated.
 *
 * The step gets only the `env` it is given plus `PATH`, `HOME` (the temporary
 * directory, so no user config is read), a temporary `GITHUB_OUTPUT`,
 * `GITHUB_STEP_SUMMARY` and `RUNNER_TEMP`, and for an action step
 * `GITHUB_ACTION_PATH`, `REVIEWER_ROOT` and an absolute `DIFF_FILE`. Stubs come
 * first in `PATH`:
 *
 * - `gh`: `gh api` answers from the fixtures by method and endpoint and logs
 *   the method, the endpoint and the `--input` payload. `--jq` is applied with
 *   the system `jq -r` on every call, `--paginate` included (one page), the
 *   way gh's built-in gojq prints strings unquoted. A `DELETE` without a
 *   fixture answers `HTTP 404` on stderr with exit code 1, like a label that is
 *   not on the PR; any other call without a fixture does the same.
 * - `npm`: logs its arguments and exits with the given code, stdout and stderr.
 * - `git`, `npx` and `curl`: refused with exit code 127, so a step never
 *   reaches the real ones, which would use the developer's config, credentials
 *   and the network.
 *
 * `openssl`, `node` and the rest of the system `PATH` stay available.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

/** One step of a workflow job or a composite action. */
export interface WorkflowStep {
  name?: string;
  run?: string;
  shell?: string;
}

/** A canned `gh api` answer. */
export interface GhFixture {
  /** HTTP method; `GET` when left out. */
  method?: string;
  endpoint: string;
  /** HTTP status; 200 when left out. 400 and above print `HTTP <status>` on stderr and exit 1. */
  status?: number;
  /** The JSON body. */
  body?: unknown;
}

/** One logged `gh api` call. */
export interface GhCall {
  method: string;
  endpoint: string;
  /** The `--input` payload as text (`-` reads stdin). */
  input?: string;
}

export interface StepOptions {
  /** The step's environment; a function receives the temporary directory, to point at files in it. */
  env?: Record<string, string> | ((dir: string) => Record<string, string>);
  gh?: GhFixture[];
  npm?: { status: number; stdout?: string; stderr?: string };
  /** Contents of the diff file of an action step (`DIFF_FILE`). */
  diff?: string;
  /** Files written relative to the temporary directory before the step runs. */
  files?: Record<string, string>;
}

export interface StepResult {
  status: number;
  stdout: string;
  stderr: string;
  /** `GITHUB_OUTPUT` as `key=value` pairs. */
  outputs: Record<string, string>;
  /** `GITHUB_STEP_SUMMARY` as written. */
  summary: string;
  gh: GhCall[];
  /** The arguments of every `npm` call. */
  npm: string[][];
  /** The `RUNNER_TEMP` the step saw (removed after the run). */
  runnerTemp: string;
}

const GH_STUB = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const dir = process.env.WORKFLOW_STUB_DIR;
const args = process.argv.slice(2);
if (args[0] !== "api") {
  process.stderr.write("gh stub: only gh api is stubbed\\n");
  process.exit(2);
}
let method = "GET";
let endpoint;
let jq;
let input;
let silent = false;
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--method" || arg === "-X") method = args[++i];
  else if (arg === "--jq" || arg === "-q") jq = args[++i];
  else if (arg === "--input") input = args[++i];
  else if (arg === "--silent") silent = true;
  else if (arg === "--paginate") continue;
  else if (arg.startsWith("-")) {
    process.stderr.write("gh stub: unknown flag " + arg + "\\n");
    process.exit(2);
  } else endpoint = arg;
}
const call = { method, endpoint };
if (input !== undefined) call.input = readFileSync(input === "-" ? 0 : input, "utf8");
appendFileSync(dir + "/gh-calls.jsonl", JSON.stringify(call) + "\\n");
const fixtures = JSON.parse(readFileSync(dir + "/gh-fixtures.json", "utf8"));
const fixture = fixtures.find((f) => (f.method ?? "GET") === method && f.endpoint === endpoint);
const status = fixture ? (fixture.status ?? 200) : 404;
if (status >= 400) {
  process.stderr.write("gh: request failed (HTTP " + status + ")\\n");
  process.exit(1);
}
if (silent) process.exit(0);
const body = JSON.stringify(fixture.body ?? null);
if (jq === undefined) {
  process.stdout.write(body + "\\n");
  process.exit(0);
}
const result = spawnSync("jq", ["-r", jq], { input: body, encoding: "utf8" });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
`;

const NPM_STUB = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");
const dir = process.env.WORKFLOW_STUB_DIR;
appendFileSync(dir + "/npm-calls.jsonl", JSON.stringify(process.argv.slice(2)) + "\\n");
const answer = JSON.parse(readFileSync(dir + "/npm-answer.json", "utf8"));
process.stdout.write(answer.stdout ?? "");
process.stderr.write(answer.stderr ?? "");
process.exit(answer.status);
`;

/** Commands no step may reach for real; each stub says so on stderr and exits 127. */
const REFUSED_COMMANDS = ["git", "npx", "curl"] as const;
const REFUSED_STUB = `#!/bin/sh
echo "workflow-steps: $(basename "$0") is not stubbed" >&2
exit 127
`;

/** The steps of `file` (repo-relative): every job's steps of a workflow, or the steps of a composite action. */
export function loadSteps(file: string): WorkflowStep[] {
  const doc = parse(readFileSync(join(import.meta.dirname, "../..", file), "utf8")) as {
    jobs?: Record<string, { steps?: WorkflowStep[] }>;
    runs?: { steps?: WorkflowStep[] };
  };
  if (doc.runs?.steps) return doc.runs.steps;
  return Object.values(doc.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

/** Reads a JSON-lines log, or `[]` when nothing was logged. */
function readLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

/** `GITHUB_OUTPUT` in its single-line `key=value` form. */
function readOutputs(path: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    const eq = line.indexOf("=");
    outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return outputs;
}

/** Runs the `run:` block of the step called `name` in `file` (see the module comment). */
export function runStep(file: string, name: string, options: StepOptions = {}): StepResult {
  const step = loadSteps(file).find((candidate) => candidate.name === name);
  if (step?.run === undefined) throw new Error(`no step with a run block named ${JSON.stringify(name)} in ${file}`);
  const isAction = file.endsWith("action.yml");

  const dir = mkdtempSync(join(tmpdir(), "workflow-step-"));
  try {
    const bin = join(dir, "bin");
    const runnerTemp = join(dir, "runner-temp");
    mkdirSync(bin);
    mkdirSync(runnerTemp);
    writeFileSync(join(bin, "gh"), GH_STUB);
    writeFileSync(join(bin, "npm"), NPM_STUB);
    chmodSync(join(bin, "gh"), 0o755);
    chmodSync(join(bin, "npm"), 0o755);
    for (const command of REFUSED_COMMANDS) {
      writeFileSync(join(bin, command), REFUSED_STUB);
      chmodSync(join(bin, command), 0o755);
    }
    writeFileSync(join(dir, "gh-fixtures.json"), JSON.stringify(options.gh ?? []));
    writeFileSync(join(dir, "npm-answer.json"), JSON.stringify(options.npm ?? { status: 0 }));
    for (const [path, content] of Object.entries(options.files ?? {})) writeFileSync(join(dir, path), content);
    const outputFile = join(dir, "github-output");
    const summaryFile = join(dir, "step-summary");
    writeFileSync(outputFile, "");
    writeFileSync(summaryFile, "");
    const script = join(dir, "step.sh");
    writeFileSync(script, step.run);

    const env: Record<string, string> = {
      PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      HOME: dir,
      WORKFLOW_STUB_DIR: dir,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      RUNNER_TEMP: runnerTemp,
    };
    if (isAction) {
      const root = join(dir, "reviewer-root");
      const actionPath = join(root, ".github/actions/ai-reviewer");
      mkdirSync(actionPath, { recursive: true });
      const diffFile = join(dir, "pr.diff");
      writeFileSync(diffFile, options.diff ?? "");
      Object.assign(env, { GITHUB_ACTION_PATH: actionPath, REVIEWER_ROOT: root, DIFF_FILE: diffFile });
    }
    Object.assign(env, typeof options.env === "function" ? options.env(dir) : (options.env ?? {}));

    const args = isAction ? ["--noprofile", "--norc", "-eo", "pipefail", script] : ["-e", script];
    const result = spawnSync("bash", args, { cwd: dir, env, encoding: "utf8", timeout: 30_000 });
    return {
      status: result.status ?? -1,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs: readOutputs(outputFile),
      summary: readFileSync(summaryFile, "utf8"),
      gh: readLines<GhCall>(join(dir, "gh-calls.jsonl")),
      npm: readLines<string[]>(join(dir, "npm-calls.jsonl")),
      runnerTemp,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
