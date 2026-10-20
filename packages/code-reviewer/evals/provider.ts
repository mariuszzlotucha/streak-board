/**
 * promptfoo provider that runs the real reviewer the way CI does: it builds the
 * case's diff with the gate's exclusions (`CI_DIFF_PATHSPECS`), resolves the
 * two commits for the repo tools, calls `reviewDiff` and returns one flat
 * result object for the assertions and `report.ts`. The reviewer is loaded
 * from `reviewerRoot` (default: this checkout; a relative path is read from the
 * main checkout), so the same cases can run the old reviewer of another
 * checkout next to the new one.
 *
 * Neither `ai` nor `promptfoo` is imported here: the repo's type check and lint
 * read this file, CI installs no promptfoo, and `ai` resolved from `evals/`
 * would be promptfoo's own `ai@6`. The reviewer's types come from its barrel,
 * type-only; promptfoo's provider shapes are declared locally. Reviewer errors
 * are recognised by `name`, not `instanceof`, since the old and the new
 * reviewer are separate module instances.
 */
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type * as Reviewer from "../index";

const execFileAsync = promisify(execFile);

/** The top-level directory of this checkout (three levels above this file). */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The exclusions of the "Compute the code diff" step in
 * `.github/workflows/review.yml`, in its order; a unit test reads them back
 * from the workflow. Each names an exact path, because `*` in a pathspec also
 * matches `/`: only the cases' YAML files and the two lockfiles leave the diff.
 */
export const CI_DIFF_PATHSPECS = [
  ":(exclude)context",
  ":(exclude)*.md",
  ":(exclude)package-lock.json",
  ":(exclude)packages/code-reviewer/evals/package-lock.json",
  ":(exclude)packages/code-reviewer/evals/cases/*.yaml",
] as const;

/** The longest head and tail of a model's raw text that `errorDetail` keeps, in characters. */
const ERROR_TEXT_EXCERPT = 400;

/** A full commit SHA: the only form a case's `base` and `head` may take, so no value reaches git as an option. */
const FULL_SHA = /^[0-9a-f]{40}$/;

/** `config` of a provider entry in a promptfoo config. */
export interface ReviewerProviderConfig {
  /** OpenRouter model id; the loaded reviewer's `DEFAULT_REVIEWER_MODEL` when left out. */
  model?: string;
  /** Checkout whose `packages/code-reviewer` runs; a relative path is read from the main checkout, an absolute one as it is; this checkout when left out. */
  reviewerRoot?: string;
  /** Passed to `reviewDiff` as `maxDiffChars`; the reviewer's default when left out. */
  maxDiffChars?: number;
}

/** The options promptfoo passes to a provider class. */
export interface ReviewerProviderOptions {
  id?: string;
  label?: string;
  config?: ReviewerProviderConfig;
}

/** The part of promptfoo's call context this provider reads. */
export interface CallApiContext {
  vars?: Record<string, unknown>;
}

/** promptfoo's token usage shape, as far as this provider fills it. */
export interface ProviderTokenUsage {
  total?: number;
  prompt?: number;
  completion?: number;
  cached?: number;
  completionDetails?: { reasoning?: number };
}

/** What a review case reports: the binding and the model's verdict, the rule's, the scores and the cost signals. */
export interface CaseOutput {
  outcome: "reviewed" | "too-large" | "unreviewable";
  /** The binding verdict of `reviewDiff`; `null` without a review. */
  verdict: "pass" | "fail" | null;
  modelVerdict: "pass" | "fail" | null;
  /** `verdictFromScores(criteria)` of the loaded reviewer. */
  ruleVerdict: "pass" | "fail" | null;
  /** The six scores by criterion name. */
  scores: Record<string, number> | null;
  /** The model's markdown summary; empty without a review. */
  summary: string;
  finishReason: string | null;
  /** Number of repo-tool calls. */
  toolCalls: number;
  toolsSkipped: boolean;
  reasoningTokens: number | null;
  /** Length of the diff handed to `reviewDiff`, in characters. */
  diffChars: number;
  /** The paths shown as binary, for `unreviewable`. */
  paths?: string[];
}

/** What a failed review run still knows about the model's answer; `errorDetail` builds it. */
export interface ErrorDetail {
  finishReason?: string;
  /** Length of the model's raw text, in characters. */
  textChars?: number;
  /** The first characters of the raw text, at most `ERROR_TEXT_EXCERPT`. */
  textHead?: string;
  /** The last characters of the raw text; left out when the head already holds all of it. */
  textTail?: string;
  /** The message of the error underneath (the parse or schema failure, the abort), at most `ERROR_TEXT_EXCERPT` characters: the SDK's schema message quotes the whole value. */
  causeMessage?: string;
}

/** A checkout root as resolved, with the reason when it is this checkout for want of the main one. */
export interface ResolvedRoot {
  /** The absolute path. */
  root: string;
  /** Why a relative `reviewerRoot` was read from this checkout: git named no main checkout. Absent otherwise. */
  note?: string;
}

/** promptfoo's provider response, as far as this provider fills it. */
export interface ProviderResponse {
  output?: CaseOutput;
  error?: string;
  cost?: number;
  tokenUsage?: ProviderTokenUsage;
  metadata?: { model: string; reviewerRoot: string; reviewerRootNote?: string; errorDetail?: ErrorDetail };
}

/** A case's input as `buildCaseInput` prepared it; `cleanup` removes a temporary repository. */
export interface CaseInput {
  diff: string;
  cwd: string;
  baseRef: string;
  headRef: string;
  cleanup: () => Promise<void>;
}

type ReviewerModule = typeof Reviewer;
type LanguageModelUsage = Reviewer.ReviewRun["usage"];

/** The shell's repository selection; it would point `git init` of a case's repository and the main-checkout lookup elsewhere. */
const GIT_REPOSITORY_VARIABLES = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
]);

/** git without the user's and the system's config and repository selection, with a fixed identity: a CI runner has none. */
export function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !GIT_REPOSITORY_VARIABLES.has(name))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "reviewer eval",
    GIT_AUTHOR_EMAIL: "eval@example.invalid",
    GIT_COMMITTER_NAME: "reviewer eval",
    GIT_COMMITTER_EMAIL: "eval@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
  };
}

/** Runs git in `cwd` without a shell and returns its stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    env: gitEnv(),
    encoding: "utf8",
    maxBuffer: 64_000_000,
  });
  return stdout;
}

/**
 * A map of repo-relative paths to file contents (`null`: delete), checked so no
 * path leaves the repository or lies inside `.git`.
 */
function fileMap(value: unknown, side: "base" | "head"): Map<string, string | null> {
  if (value === undefined) return new Map();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`files.${side} must be a map of paths to contents`);
  }
  const files = new Map<string, string | null>();
  for (const [path, content] of Object.entries(value as Record<string, unknown>)) {
    const normalised = normalize(path);
    if (isAbsolute(normalised) || normalised === ".." || normalised.startsWith("../") || normalised === ".") {
      throw new Error(`files.${side}: ${JSON.stringify(path)} is not a repo-relative file path`);
    }
    // A file under .git/ would rewrite the temporary repository's config or hooks, which git then runs.
    if (normalised.split("/").some((segment) => segment.toLowerCase() === ".git")) {
      throw new Error(`files.${side}: ${JSON.stringify(path)} is inside .git`);
    }
    if (typeof content === "string" || (side === "head" && content === null)) files.set(normalised, content);
    else throw new Error(`files.${side}.${path} must be a string${side === "head" ? " or null" : ""}`);
  }
  return files;
}

/** Writes (or, for `null`, deletes) every file of `files` under `dir`. */
async function applyFiles(dir: string, files: Map<string, string | null>): Promise<void> {
  for (const [path, content] of files) {
    const target = join(dir, path);
    if (content === null) {
      await rm(target, { force: true });
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
}

/**
 * Prepares one case for review. `base` and `head` are the full SHAs of two
 * commits of the repository at `repoRoot`; `files: { base, head }` builds a
 * temporary repository with one commit per side instead (a `null` content in
 * `head` deletes the file), removed by `cleanup`. A case with `files` and
 * `base` or `head` is refused, so neither input wins silently. The diff is
 * the CI one: `git diff <base>...<head> -- . <CI_DIFF_PATHSPECS>`, run, like
 * every git call here, without the user's or the system's git config.
 */
export async function buildCaseInput(vars: Record<string, unknown>, repoRoot: string): Promise<CaseInput> {
  let cwd = repoRoot;
  let baseRef: string;
  let headRef: string;
  let cleanup = (): Promise<void> => Promise.resolve();
  if (vars.files !== undefined && (vars.base !== undefined || vars.head !== undefined)) {
    throw new Error("a case gives vars.files or vars.base and vars.head, not both");
  }
  if (vars.files !== undefined) {
    if (typeof vars.files !== "object" || vars.files === null) throw new Error("files must be { base, head }");
    const { base, head } = vars.files as { base?: unknown; head?: unknown };
    const baseFiles = fileMap(base, "base");
    const headFiles = fileMap(head, "head");
    const dir = await mkdtemp(join(tmpdir(), "reviewer-eval-"));
    cleanup = () => rm(dir, { recursive: true, force: true });
    try {
      await git(dir, ["init", "-q", "-b", "main"]);
      await applyFiles(dir, baseFiles);
      await git(dir, ["add", "-A"]);
      await git(dir, ["commit", "-q", "--allow-empty", "-m", "base"]);
      baseRef = (await git(dir, ["rev-parse", "HEAD"])).trim();
      await applyFiles(dir, headFiles);
      await git(dir, ["add", "-A"]);
      await git(dir, ["commit", "-q", "--allow-empty", "-m", "head"]);
      headRef = (await git(dir, ["rev-parse", "HEAD"])).trim();
    } catch (error) {
      await cleanup();
      throw error;
    }
    cwd = dir;
  } else if (typeof vars.base === "string" && typeof vars.head === "string") {
    if (!FULL_SHA.test(vars.base) || !FULL_SHA.test(vars.head)) {
      throw new Error("vars.base and vars.head must be full 40-character commit SHAs");
    }
    baseRef = vars.base;
    headRef = vars.head;
  } else {
    throw new Error("a case needs vars.base and vars.head (commits of this repository) or vars.files");
  }
  try {
    const diff = await git(cwd, ["diff", `${baseRef}...${headRef}`, "--", ".", ...CI_DIFF_PATHSPECS]);
    return { diff, cwd, baseRef, headRef, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** A non-empty string var, or `undefined`. */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** promptfoo's token usage from the reviewer's summed `LanguageModelUsage`. */
function tokenUsage(usage: LanguageModelUsage): ProviderTokenUsage {
  return {
    total: usage.totalTokens,
    prompt: usage.inputTokens,
    completion: usage.outputTokens,
    cached: usage.inputTokenDetails.cacheReadTokens,
    completionDetails: { reasoning: usage.outputTokenDetails.reasoningTokens },
  };
}

/** The output of a case that never reached the model. */
function notReviewed(outcome: "too-large" | "unreviewable", diffChars: number, paths?: string[]): CaseOutput {
  return {
    outcome,
    verdict: null,
    modelVerdict: null,
    ruleVerdict: null,
    scores: null,
    summary: "",
    finishReason: null,
    toolCalls: 0,
    toolsSkipped: false,
    reasoningTokens: null,
    diffChars,
    ...(paths ? { paths } : {}),
  };
}

/** The `name` of a thrown value, for errors that cannot be matched with `instanceof`. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** `"<name>: <message>"` of a thrown value. */
function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : `${typeof error}: ${String(error)}`;
}

/** The `message` of a thrown value, when it has a string one. */
function errorMessage(error: unknown): string | undefined {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" ? message : undefined;
}

/**
 * What the SDK's `NoObjectGeneratedError` knows about a failed answer, from the
 * error itself or from the `cause` of a `ReviewRunError`, which wraps it: the
 * finish reason, the length, head and tail of the raw text and the message of
 * its own cause. Recognised by `name`, like every reviewer error here.
 * `undefined` when the error carries none of it.
 */
export function errorDetail(error: unknown): ErrorDetail | undefined {
  const isNoObject = (value: unknown) => errorName(value).endsWith("NoObjectGeneratedError");
  const wrapped = (error as { cause?: unknown } | null | undefined)?.cause;
  const source = isNoObject(error) ? error : isNoObject(wrapped) ? wrapped : undefined;
  const { text, finishReason, cause } = (source ?? {}) as { text?: unknown; finishReason?: unknown; cause?: unknown };
  const outer = (error as { finishReason?: unknown } | null | undefined)?.finishReason;
  const reason = typeof finishReason === "string" ? finishReason : typeof outer === "string" ? outer : undefined;
  const raw = typeof text === "string" && text !== "" ? text : undefined;
  const known = Object.entries({
    finishReason: reason,
    textChars: raw?.length,
    textHead: raw?.slice(0, ERROR_TEXT_EXCERPT),
    textTail: raw !== undefined && raw.length > ERROR_TEXT_EXCERPT ? raw.slice(-ERROR_TEXT_EXCERPT) : undefined,
    causeMessage: errorMessage(source ? cause : wrapped)?.slice(0, ERROR_TEXT_EXCERPT),
  }).filter(([, value]) => value !== undefined);
  return known.length > 0 ? Object.fromEntries(known) : undefined;
}

/**
 * The root of the main checkout, from the parent of git's common directory
 * (`<main>/.git` for the main checkout and for every linked worktree);
 * `undefined` when `commonDir` is not an absolute path ending in `.git`, as in
 * a bare repository.
 */
export function mainCheckoutFromCommonDir(commonDir: string): string | undefined {
  const path = commonDir.trim();
  return isAbsolute(path) && basename(path) === ".git" ? dirname(path) : undefined;
}

/**
 * The main checkout's root from the output of `runGit` (git's common directory);
 * this checkout (`REPO_ROOT`) with a `note` when git fails or names no `.git`
 * directory, so a relative `reviewerRoot` read from the worktree is visible in
 * the result (the provider stays free of side effects; the report prints the note).
 */
export function findMainCheckout(runGit: () => string): ResolvedRoot {
  try {
    const root = mainCheckoutFromCommonDir(runGit());
    if (root !== undefined) return { root };
  } catch {
    // reported below, like an unusable answer
  }
  return {
    root: REPO_ROOT,
    note: `git did not name the main checkout; a relative reviewerRoot was read from ${REPO_ROOT}`,
  };
}

let mainCheckout: ResolvedRoot | undefined;

/** The main checkout's root: asked of git once and remembered. */
function mainCheckoutRoot(): ResolvedRoot {
  mainCheckout ??= findMainCheckout(() =>
    execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: REPO_ROOT,
      env: gitEnv(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  return mainCheckout;
}

/**
 * The absolute checkout a `reviewerRoot` names: an unset one, any spelling of
 * the current directory (`"."`, `"./"`, `""`) and an absolute path stay as they
 * are (this checkout is the base), any other relative path is read from the
 * main checkout (`main()`, asked only then, whose `note` is passed on), so
 * `../streak-board-worktrees/eval-old` means the same from every worktree.
 */
export function resolveReviewerRoot(configured: string | undefined, main: () => ResolvedRoot): ResolvedRoot {
  if (configured === undefined || isAbsolute(configured) || normalize(configured).replace(/[\\/]+$/, "") === ".") {
    return { root: resolve(REPO_ROOT, configured ?? ".") };
  }
  const { root, note } = main();
  return note === undefined ? { root: resolve(root, configured) } : { root: resolve(root, configured), note };
}

/**
 * One reviewer configuration as a promptfoo provider. The constructor only
 * stores its options (`promptfoo validate` runs it, possibly before the old
 * reviewer's worktree exists); the reviewer is imported on the first
 * `callApi`, once per provider.
 */
export default class ReviewerProvider {
  readonly label: string | undefined;
  readonly config: ReviewerProviderConfig;
  private readonly providerId: string;
  private reviewer: Promise<ReviewerModule> | undefined;

  constructor(options: ReviewerProviderOptions = {}) {
    this.providerId = options.id ?? "code-reviewer";
    this.label = options.label;
    this.config = options.config ?? {};
  }

  id(): string {
    return this.providerId;
  }

  /** The checkout whose reviewer this provider runs, as an absolute path, with the note of a fallback. */
  private reviewerRoot(): ResolvedRoot {
    return resolveReviewerRoot(this.config.reviewerRoot, mainCheckoutRoot);
  }

  private loadReviewer(): Promise<ReviewerModule> {
    this.reviewer ??= import(
      pathToFileURL(join(this.reviewerRoot().root, "packages/code-reviewer/index.ts")).href
    ) as Promise<ReviewerModule>;
    return this.reviewer;
  }

  async callApi(_prompt: string, context?: CallApiContext): Promise<ProviderResponse> {
    const { root: reviewerRoot, note } = this.reviewerRoot();
    const describeRun = (model: string) =>
      note === undefined ? { model, reviewerRoot } : { model, reviewerRoot, reviewerRootNote: note };
    let model = this.config.model ?? "unknown";
    let input: CaseInput | undefined;
    try {
      const reviewer = await this.loadReviewer();
      model = this.config.model ?? reviewer.DEFAULT_REVIEWER_MODEL;
      const vars = context?.vars ?? {};
      input = await buildCaseInput(vars, REPO_ROOT);
      const metadata = describeRun(model);
      try {
        const repo = await reviewer.resolveRepo({ baseRef: input.baseRef, headRef: input.headRef }, input.cwd);
        const run = await reviewer.reviewDiff(input.diff, {
          model,
          pullRequest: { title: optionalString(vars.title), body: optionalString(vars.body) },
          repo,
          maxDiffChars: this.config.maxDiffChars,
          abortSignal: AbortSignal.timeout(reviewer.DEFAULT_REVIEW_TIMEOUT_MS),
        });
        const scores = Object.fromEntries(
          Object.entries(run.output.criteria).map(([name, criterion]) => [name, criterion.score]),
        );
        return {
          output: {
            outcome: "reviewed",
            verdict: run.output.verdict,
            modelVerdict: run.modelVerdict,
            ruleVerdict: reviewer.verdictFromScores(run.output.criteria),
            scores,
            summary: run.output.summary,
            finishReason: run.finishReason,
            toolCalls: run.toolCalls.length,
            toolsSkipped: run.toolsSkipped,
            reasoningTokens: run.usage.outputTokenDetails.reasoningTokens ?? null,
            diffChars: input.diff.length,
          },
          cost: run.costUsd ?? undefined,
          tokenUsage: tokenUsage(run.usage),
          metadata,
        };
      } catch (error) {
        const name = errorName(error);
        if (name === "DiffTooLargeError") return { output: notReviewed("too-large", input.diff.length), metadata };
        if (name === "UnreviewableDiffError") {
          const paths = (error as { paths?: unknown }).paths;
          const shown = Array.isArray(paths) ? paths.map(String) : [];
          return { output: notReviewed("unreviewable", input.diff.length, shown), metadata };
        }
        if (name === "ReviewRunError") {
          const failed = error as { costUsd?: number | null; usage?: LanguageModelUsage };
          const detail = errorDetail(error);
          return {
            error: describeError(error),
            cost: failed.costUsd ?? undefined,
            tokenUsage: failed.usage ? tokenUsage(failed.usage) : undefined,
            metadata: detail ? { ...metadata, errorDetail: detail } : metadata,
          };
        }
        throw error;
      }
    } catch (error) {
      return { error: describeError(error), metadata: describeRun(model) };
    } finally {
      await input?.cleanup();
    }
  }
}
