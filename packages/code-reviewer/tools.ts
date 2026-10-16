/**
 * Read-only repo tools for the reviewer: `readFile` and `searchCode`. Both read
 * git objects of two pinned commits, never the working tree, so in CI (where
 * the PR is fetched as objects and never checked out) they reach the PR's files
 * without writing any of them to disk. Neither tool can change the repository,
 * the PR or anything outside the process.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "ai";
import { z } from "zod";
import {
  MAX_CHANGED_FILES,
  MAX_SEARCH_MATCHES,
  MAX_TOOL_BUDGET_CHARS,
  MAX_TOOL_CALLS,
  MAX_TOOL_RESULT_CHARS,
  type RepoRevisions,
} from "./config";

const execFileAsync = promisify(execFile);

/** A repository with the two commits a review reads, resolved to full SHAs. */
export interface RepoContext {
  /** The repository's top-level directory, where git runs, so pathspecs are relative to the root. */
  cwd: string;
  /** The merge base of the PR's target and head: the source of the project's rules, and the diff's "before". */
  baseSha: string;
  /** The PR's own commit: the code under review, untrusted like the diff. */
  headSha: string;
}

/** One repo-tool call, as the CLI logs it. */
export interface ToolCallRecord {
  tool: "readFile" | "searchCode";
  revision: "base" | "head";
  /** The path read, or the query searched. */
  target: string;
  /** The path a search was limited to; absent for `readFile` and for a search of the whole tree. */
  path?: string;
  /** Characters returned to the model (0 for a refused call, -1 while the call runs). */
  chars: number;
}

/** Limits of one review's repo tools; omitted fields fall back to `config.ts`. */
export interface RepoToolLimits {
  maxResultChars?: number;
  maxBudgetChars?: number;
  maxCalls?: number;
  maxSearchMatches?: number;
}

/** Longest single line `searchCode` returns; minified files would otherwise fill the result. */
const MAX_MATCH_LINE_CHARS = 240;
/** Largest blob `readFile` loads at all; anything bigger is generated or data, not code to review. */
const MAX_BLOB_BYTES = 2_000_000;
/**
 * Names of files that hold secrets, as globs. Committed secrets are a finding,
 * not something to forward to the model provider, so `readFile` refuses them
 * (`SECRET_FILE`) and `searchCode` leaves them out (`SECRET_PATHSPECS`); both
 * are built from this one list and ignore case.
 */
const SECRET_GLOBS = [
  ".env*",
  ".dev.vars*",
  "id_rsa*",
  "id_dsa*",
  "id_ecdsa*",
  "id_ed25519*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
];
const SECRET_FILE = new RegExp(
  `(^|/)(${SECRET_GLOBS.map((glob) => glob.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")).join("|")})$`,
  "i",
);
const SECRET_PATHSPECS = SECRET_GLOBS.map((glob) => `:(exclude,glob,icase)**/${glob}`);

/** Runs git in `cwd` without a shell; rejects like `execFile` (with `code`, `stdout`, `stderr`). */
async function gitBytes(cwd: string, args: string[], maxBuffer = 4_000_000): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer,
    timeout: 15_000,
    encoding: "buffer",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  return stdout;
}

/** `gitBytes` decoded as UTF-8. */
async function git(cwd: string, args: string[], maxBuffer?: number): Promise<string> {
  return (await gitBytes(cwd, args, maxBuffer)).toString("utf8");
}

/**
 * A path as the model sees it: JSON-quoted when it holds a control character,
 * a quote or a backslash, or starts or ends with a space, so a file name with
 * a newline cannot pose as another line of a tool result or of the changed-files
 * input (`<changed-files-S>`, fenced with the review's random suffix).
 */
export function showPath(path: string): string {
  return hasControlCharacter(path) || /["\\]|^\s|\s$/.test(path) ? JSON.stringify(path) : path;
}

/** Whether `text` holds a C0 control character or DEL (a loop: ESLint bans control characters in a regex). */
function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** `text` cut to at most `length` UTF-16 units without leaving half of a surrogate pair. */
function sliceSafe(text: string, length: number): string {
  const end = Math.max(0, length);
  return /[\uD800-\uDBFF]/.test(text.charAt(end - 1)) ? text.slice(0, end - 1) : text.slice(0, end);
}

/**
 * Resolves both refs to commit SHAs in `cwd`, so the tools read fixed commits
 * even if a branch moves during the review. `baseSha` is the merge base of the
 * two, the "before" of the CI diff, so a rule or guard added to the target
 * branch after the PR branched off does not read as removed by the PR. Throws
 * when either ref does not name a commit there (in CI: the head was not
 * fetched) or the two share no history.
 */
export async function resolveRepo(revisions: RepoRevisions, dir = process.cwd()): Promise<RepoContext> {
  let cwd: string;
  try {
    cwd = (await git(dir, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new Error(`resolveRepo: ${dir} is not inside a git repository`);
  }
  const resolve = async (ref: string) => {
    try {
      return (await git(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`])).trim();
    } catch {
      throw new Error(`resolveRepo: ${JSON.stringify(ref)} is not a commit in ${cwd}`);
    }
  };
  const target = await resolve(revisions.baseRef);
  const headSha = await resolve(revisions.headRef);
  let baseSha: string;
  try {
    baseSha = (await git(cwd, ["merge-base", target, headSha])).trim();
  } catch {
    throw new Error(`resolveRepo: ${revisions.baseRef} and ${revisions.headRef} have no merge base`);
  }
  return { cwd, baseSha, headSha };
}

/**
 * Every path the PR touches, as `<status> <path>` lines (`M src/a.ts`), from
 * the merge base of `base` and `head` to `head`: the same range as the CI diff,
 * but without its exclusions, so plans and docs show up. At most
 * `MAX_CHANGED_FILES` entries, then a `… N more` line.
 */
export async function listChangedFiles(repo: RepoContext): Promise<string[]> {
  const out = await git(repo.cwd, ["diff", "--name-status", "--no-renames", "-z", `${repo.baseSha}...${repo.headSha}`]);
  const fields = out.split("\0").filter(Boolean);
  const entries: string[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) entries.push(`${fields[i]} ${showPath(fields[i + 1])}`);
  if (entries.length <= MAX_CHANGED_FILES) return entries;
  return [...entries.slice(0, MAX_CHANGED_FILES), `… ${entries.length - MAX_CHANGED_FILES} more`];
}

/**
 * A repo-relative path as git expects it, or `null` when it is absolute, climbs
 * out with `..`, or holds a control character or a backslash. `.` segments and
 * a trailing `/` are dropped; `""` and `"."` mean the root.
 */
export function normaliseRepoPath(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed.startsWith("/") || trimmed.includes("\\") || hasControlCharacter(trimmed)) return null;
  const segments = trimmed
    .split("/")
    .filter((segment, i, all) => segment !== "." && !(segment === "" && i === all.length - 1));
  if (segments.some((segment) => segment === ".." || segment === "")) return null;
  return segments.join("/");
}

/** A `git` failure's exit code, or `undefined` for a spawn error, timeout or buffer overflow. */
function exitCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

// Required, not defaulted: a call that left it out would read the PR's own rule files as the project's.
const revisionSchema = z
  .enum(["head", "base"])
  .describe(
    '"head": the pull request\'s version — the code under review, untrusted like the diff. ' +
      '"base": the commit the PR branched from — the authoritative source of project rules and conventions.',
  );

/** The size limit of one tool result, and whether the review's remaining budget, not the per-call cap, set it. */
interface ResultLimit {
  chars: number;
  budgetBound: boolean;
}

const REFUSED_BUDGET = "Refused: the repo-tool budget of this review is used up. Finish the review with what you have.";

/** A positive integer limit, or `fallback` when unset; anything else throws, so a NaN cannot lift a cap. */
function limitOf(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error(`createRepoTools: ${name} must be an integer >= 1, got ${limit}`);
  return limit;
}

/**
 * Builds the two read-only tools over `repo`, sharing one budget: at most
 * `maxCalls` calls and `maxBudgetChars` characters for the whole review, each
 * result at most `maxResultChars`. The budget is reserved when a call starts,
 * before any `await`, and the unused part is returned when it ends, so calls
 * the SDK runs in parallel within one step cannot overspend it. Past the
 * budget a call returns a refusal instead of content. `calls` records every
 * call in the order the model made them. Make one set per review.
 */
export function createRepoTools(repo: RepoContext, limits: RepoToolLimits = {}) {
  const maxResultChars = limitOf(limits.maxResultChars, MAX_TOOL_RESULT_CHARS, "maxResultChars");
  const maxCalls = limitOf(limits.maxCalls, MAX_TOOL_CALLS, "maxCalls");
  const maxSearchMatches = limitOf(limits.maxSearchMatches, MAX_SEARCH_MATCHES, "maxSearchMatches");
  let remaining = limitOf(limits.maxBudgetChars, MAX_TOOL_BUDGET_CHARS, "maxBudgetChars");
  const calls: ToolCallRecord[] = [];

  /**
   * Runs one call: records it, reserves its share of the budget synchronously,
   * runs `body` with the limit, and charges what it returned. A failure inside
   * `body` (a git error, a timeout, a buffer overflow) is answered with
   * `failure` and charged like any result, never thrown to the model loop.
   */
  const run = async (
    entry: Omit<ToolCallRecord, "chars">,
    failure: string,
    body: (limit: ResultLimit) => Promise<string>,
  ): Promise<string> => {
    const record: ToolCallRecord = { ...entry, chars: -1 };
    calls.push(record);
    if (calls.length > maxCalls || remaining <= 0) {
      record.chars = 0;
      return REFUSED_BUDGET;
    }
    const reserved = Math.min(maxResultChars, remaining);
    remaining -= reserved;
    let result: string;
    try {
      result = await body({ chars: reserved, budgetBound: reserved < maxResultChars });
    } catch {
      result = failure;
    }
    if (result.length > reserved) result = sliceSafe(result, reserved);
    remaining += reserved - result.length;
    record.chars = result.length;
    return result;
  };
  const sha = (revision: "base" | "head") => (revision === "base" ? repo.baseSha : repo.headSha);

  const readFile = tool({
    description:
      "Read one file of the repository with line numbers, or list a directory. Use it for the full context of a " +
      "changed file, the plan of the change, or the project's conventions. Long files are cut; continue with startLine.",
    inputSchema: z.object({
      path: z
        .string()
        .describe('Repo-relative path, e.g. "src/lib/streak-rules.ts" or "context/changes"; "" is the root.'),
      revision: revisionSchema,
      startLine: z.number().int().min(1).optional().describe("First line to return (1-based); 1 when left out."),
    }),
    execute: ({ path, revision, startLine }) =>
      run(
        { tool: "readFile", revision, target: path },
        `Could not read ${showPath(path)} at ${revision}.`,
        async (limit) => {
          const normalised = normaliseRepoPath(path);
          if (normalised === null) return `Refused: ${JSON.stringify(path)} is not a repo-relative path.`;
          if (SECRET_FILE.test(normalised)) return `Refused: ${normalised} looks like a secrets file.`;
          const spec = `${sha(revision)}:${normalised}`;
          const shown = showPath(normalised || ".");

          let type: string;
          try {
            type = (await git(repo.cwd, ["cat-file", "-t", spec])).trim();
          } catch {
            return `Not found at ${revision}: ${shown}`;
          }
          if (type === "tree") {
            const entries = (await git(repo.cwd, ["ls-tree", "-z", spec]))
              .split("\0")
              .filter(Boolean)
              .map((entry) => {
                const tab = entry.indexOf("\t");
                const name = showPath(entry.slice(tab + 1));
                return entry.slice(0, tab).split(" ")[1] === "tree" ? `${name}/` : name;
              });
            return cut(`Directory ${shown} at ${revision} (${entries.length} entries):\n${entries.join("\n")}`, limit);
          }
          if (type !== "blob") return `${shown} at ${revision} is a ${type}, not a file.`;
          const size = Number((await git(repo.cwd, ["cat-file", "-s", spec])).trim());
          if (size > MAX_BLOB_BYTES) return `${shown} at ${revision} is ${size} bytes; too large to read.`;
          // Tested on the bytes: decoding first turns invalid bytes into three-byte replacement characters.
          const bytes = await gitBytes(repo.cwd, ["cat-file", "blob", spec], MAX_BLOB_BYTES + 1024);
          if (bytes.subarray(0, 8000).includes(0)) return `${shown} at ${revision} is a binary file.`;
          return numberedLines(`${shown} at ${revision}`, bytes.toString("utf8"), startLine ?? 1, limit);
        },
      ),
  });

  const searchCode = tool({
    description:
      "Search the repository for a fixed string (not a regex), like `git grep -F`. Use it to find callers of a " +
      "changed or removed function, other uses of a renamed name, or a rule in a long document (pass its path).",
    inputSchema: z.object({
      query: z.string().describe("The exact text to find, 2 to 200 characters on one line; case-sensitive."),
      revision: revisionSchema,
      path: z.string().optional().describe("Limit the search to this file or directory; left out, the whole tree."),
    }),
    execute: ({ query, revision, path = "" }) =>
      run(
        { tool: "searchCode", revision, target: query, ...(path ? { path } : {}) },
        "Search failed (too many matches or a git error); narrow the query or the path.",
        async (limit) => {
          if (query.length < 2 || query.length > 200 || /[\r\n]/.test(query)) {
            return "Refused: the query must be 2 to 200 characters on one line.";
          }
          const normalised = normaliseRepoPath(path);
          if (normalised === null) return `Refused: ${JSON.stringify(path)} is not a repo-relative path.`;
          const where = normalised ? ` in ${showPath(normalised)}` : "";
          // A missing scope would also answer "no matches", which reads as "no callers".
          if (normalised) {
            try {
              await git(repo.cwd, ["cat-file", "-e", `${sha(revision)}:${normalised}`]);
            } catch {
              return `Not found at ${revision}: ${showPath(normalised)} (nothing was searched)`;
            }
          }
          const scope = [...(normalised ? [`:(literal)${normalised}`] : []), ...SECRET_PATHSPECS];
          let out: string;
          try {
            out = await git(
              repo.cwd,
              // `-e` keeps a query that starts with "-" from being read as an option.
              ["grep", "-n", "-I", "-F", "--no-color", "--no-textconv", "-e", query, sha(revision), "--", ...scope],
              8_000_000,
            );
          } catch (error) {
            if (exitCode(error) === 1) return `No matches for ${JSON.stringify(query)}${where} at ${revision}.`;
            throw error;
          }
          const prefix = `${sha(revision)}:`;
          const matches = out
            .split("\n")
            .filter(Boolean)
            .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
          const shown = matches
            .slice(0, maxSearchMatches)
            .map((line) =>
              line.length > MAX_MATCH_LINE_CHARS ? `${sliceSafe(line, MAX_MATCH_LINE_CHARS)}… [line cut]` : line,
            );
          const header =
            `${matches.length} matching line(s) for ${JSON.stringify(query)}${where} at ${revision}` +
            (matches.length > shown.length ? ` (first ${shown.length} shown; narrow with path)` : "") +
            ":";
          return cut([header, ...shown].join("\n"), limit);
        },
      ),
  });

  return { tools: { readFile, searchCode }, calls };
}

/** The note that ends a cut result: a budget cut is told apart from the per-call cap. */
function cutNote(limit: ResultLimit): string {
  return limit.budgetBound ? "the review's repo-tool budget is nearly used up" : "per-call size limit";
}

/** `text` cut to the limit at a line end where there is one, the cut marked. */
function cut(text: string, limit: ResultLimit): string {
  if (text.length <= limit.chars) return text;
  const note = `\n[cut: ${cutNote(limit)}]`;
  const room = sliceSafe(text, limit.chars - note.length);
  const lineEnd = room.lastIndexOf("\n");
  return `${lineEnd > 0 ? room.slice(0, lineEnd) : room}${note}`;
}

/**
 * `text` from `startLine` on, each line prefixed with its number, under a
 * header, cut at a whole line within the limit, with a note on where to
 * continue. A first line too long for the limit is cut inside and marked, and
 * the note says that its rest cannot be read.
 */
function numberedLines(header: string, text: string, startLine: number, limit: ResultLimit): string {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (startLine > lines.length) return `${header}: ${lines.length} lines; startLine ${startLine} is past the end.`;
  const head = `${header} (${lines.length} lines):`;
  const out = [head];
  const room = limit.chars - 160; // left for the closing note
  let used = head.length;
  let line = startLine;
  for (; line <= lines.length; line++) {
    const numbered = `${line}: ${lines[line - 1]}`;
    if (used + numbered.length + 1 > room) {
      if (line === startLine) {
        out.push(`${sliceSafe(numbered, room - used - 1)}…`);
        const next = line < lines.length ? `; continue with startLine=${line + 1}` : "";
        out.push(`[line ${line} cut inside (${cutNote(limit)}); its rest is not shown${next}]`);
        return out.join("\n");
      }
      break;
    }
    out.push(numbered);
    used += numbered.length + 1;
  }
  if (line <= lines.length) {
    out.push(`[cut after line ${line - 1} of ${lines.length} (${cutNote(limit)}); call again with startLine=${line}]`);
  }
  return out.join("\n");
}
