// Migration guard: compares the migrations of this branch with the PR's base and fails on three rules. Zero
// dependencies on purpose; the rule functions are pure and exported, the CLI at the bottom only talks to git.
//
//   1. Immutability: a merged migration is never deleted, renamed or edited beyond comments and blank lines. The hosted
//      history records the applied version, and a missing file breaks `supabase db push`. An edit that is not comment-only
//      needs a new line in supabase/checks/migration-edit-allowlist.txt for this exact content (see --entry).
//   2. Marker: a new migration that drops an object, alters a policy, renames something or revokes a privilege on an
//      object created by an earlier migration must carry one `-- compat: <text>` line. The heuristic prompts the author;
//      it proves nothing about compatibility.
//   3. Ordering: a new migration must sort after every migration at the base, otherwise `supabase db push` is expected
//      to refuse it. The file is new in the PR, so a rename to a newer timestamp is free.
//
// Run: node scripts/migration-guard.mjs [--base <ref>]   (default origin/master; CI runs it in the `integration` job)
//      node scripts/migration-guard.mjs --entry <migration file>   prints the allowlist line for the file's current content
// Exit 0 passes; exit 1 prints each violation as a `::error file=…::` annotation and each used exception as a
// `::warning file=…::` annotation.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = "supabase/migrations";
export const ALLOWLIST_PATH = "supabase/checks/migration-edit-allowlist.txt";
export const MIN_REASON_LENGTH = 20;
export const ENTRY_PLACEHOLDER = "<reason>";
const DEFAULT_BASE = "origin/master";

/**
 * @typedef {object} Change One line of `git diff --name-status --find-renames`.
 * @property {"A" | "M" | "D" | "R"} status Added, modified, deleted or renamed.
 * @property {string} path The path at HEAD (for a rename, the new path).
 * @property {string} [from] The old path of a rename.
 */

/**
 * @typedef {object} AllowlistEntry One exception line of the allowlist.
 * @property {number} line The 1-based line number in the allowlist file.
 * @property {string} file The migration file name (no directory).
 * @property {string} hash The sha256 (hex) of the edited file's content.
 * @property {string} reason The free-text reason.
 */

/**
 * @typedef {object} Finding A violation or a warning, addressed to one file.
 * @property {string} file The repo-relative path the finding is about.
 * @property {string} message One line of text.
 * @property {number} [line] A 1-based line number in that file, when known.
 */

/**
 * @typedef {object} CreatedObjects The tables, views and functions a set of migrations creates.
 * @property {Set<string>} tables Unqualified, unquoted, lower-case table names.
 * @property {Set<string>} views Same for views (materialized or not).
 * @property {Set<string>} functions Same for functions and procedures (overloads collapse to one name).
 */

/**
 * @typedef {object} GuardInput Everything the rules need, read from git by the CLI or built in memory by a test.
 * @property {Change[]} changes The migration changes between the base and HEAD.
 * @property {string[]} baseMigrations Repo-relative paths of every migration at the base.
 * @property {(file: string) => string} readBase Reads a repo-relative path at the base.
 * @property {(file: string) => string} readHead Reads a repo-relative path at HEAD.
 * @property {string} baseAllowlist The allowlist at the base ("" when absent).
 * @property {string} headAllowlist The allowlist at HEAD ("" when absent).
 */

/**
 * @typedef {object} GuardResult The outcome of one guard run.
 * @property {Finding[]} violations Each one fails the run.
 * @property {Finding[]} warnings Each used allowlist entry.
 */

/**
 * Removes `--` comments that are outside single-quoted strings. Everything else, including the newline that ends a
 * comment, stays, so line numbers survive.
 * @param {string} sql The SQL text.
 * @returns {string} The text without line comments.
 */
export function stripLineComments(sql) {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      if (end === -1) break;
      i = end - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * The form of a migration that two edits differing only in comments and blank lines share: line endings normalised,
 * `--` comments outside strings removed, trailing whitespace trimmed, blank lines dropped.
 * @param {string} sql The SQL text.
 * @returns {string} The normalised text.
 */
export function normalizeSql(sql) {
  return stripLineComments(sql.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Whether two versions of a migration differ only in comments and blank lines.
 * @param {string} base The content at the base.
 * @param {string} head The content at HEAD.
 * @returns {boolean} True when the normalised forms are equal.
 */
export function isCommentOnlyEdit(base, head) {
  return normalizeSql(base) === normalizeSql(head);
}

/**
 * The sha256 of a file's content, as the allowlist records it.
 * @param {string} content The exact file content.
 * @returns {string} 64 hex characters.
 */
export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Splits a text into lines, dropping the empty element a trailing newline would produce.
 * @param {string} text The text.
 * @returns {string[]} Its lines.
 */
function lines(text) {
  const all = text.replace(/\r\n?/g, "\n").split("\n");
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  return all;
}

/**
 * Whether the base allowlist's lines are an unchanged prefix of HEAD's (the file is append-only).
 * @param {string} base The allowlist at the base.
 * @param {string} head The allowlist at HEAD.
 * @returns {boolean} True when nothing before the appended lines changed.
 */
export function isAppendOnly(base, head) {
  const baseLines = lines(base);
  const headLines = lines(head);
  return baseLines.every((line, i) => headLines[i] === line);
}

/**
 * Parses allowlist lines. `#` lines and blank lines are ignored; a malformed line is returned as an error.
 * @param {string} text The allowlist content.
 * @param {number} [fromLine] The 1-based line to start at (lines before it are skipped). Default 1.
 * @returns {{ entries: AllowlistEntry[], errors: Finding[] }} The entries and the malformed lines.
 */
export function parseAllowlist(text, fromLine = 1) {
  /** @type {AllowlistEntry[]} */
  const entries = [];
  /** @type {Finding[]} */
  const errors = [];
  lines(text).forEach((raw, index) => {
    const line = index + 1;
    if (line < fromLine) return;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const match = /^(\S+)\s+([0-9a-f]{64})\s+(.+)$/.exec(trimmed);
    if (!match) {
      errors.push({
        file: ALLOWLIST_PATH,
        line,
        message: `Malformed allowlist line: expected "<migration file name> <sha256> <reason>" (node scripts/migration-guard.mjs --entry <file> prints it).`,
      });
      return;
    }
    entries.push({ line, file: match[1], hash: match[2], reason: match[3].trim() });
  });
  return { entries, errors };
}

/**
 * Strips `--` comments, dollar-quoted bodies and single-quoted strings, leaving the statements to scan.
 * @param {string} sql The SQL text.
 * @returns {string} The scannable text.
 */
function scannable(sql) {
  return stripLineComments(sql.replace(/\r\n?/g, "\n"))
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "$$$$")
    .replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Splits scannable SQL into trimmed, non-empty statements.
 * @param {string} sql The SQL text (raw; it is made scannable here).
 * @returns {string[]} The statements, without the `;`.
 */
function statements(sql) {
  return scannable(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/**
 * The unqualified, unquoted, lower-case form of an object name (`public."Groups"` becomes `groups`).
 * @param {string} name The name as written.
 * @returns {string} The normalised name.
 */
function objectName(name) {
  const bare = name.replace(/"/g, "");
  return (bare.split(".").pop() ?? bare).toLowerCase();
}

/**
 * The tables, views and functions one or more migrations create.
 * @param {string[]} sqls The migrations' SQL texts.
 * @returns {CreatedObjects} The created names.
 */
export function createdObjects(sqls) {
  /** @type {CreatedObjects} */
  const created = { tables: new Set(), views: new Set(), functions: new Set() };
  const pattern =
    /\bcreate\s+(?:or\s+replace\s+)?(?:(?:temp|temporary|unlogged)\s+)?(?:materialized\s+)?(table|view|function|procedure)\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi;
  for (const sql of sqls) {
    for (const [, kind, name] of scannable(sql).matchAll(pattern)) {
      const key = kind.toLowerCase();
      const set = key === "table" ? created.tables : key === "view" ? created.views : created.functions;
      set.add(objectName(name));
    }
  }
  return created;
}

/**
 * The statements of a migration that the marker rule flags: any `drop`, `alter policy`, `alter … rename`, and a
 * `revoke` on a table, view or function that an earlier migration created (`all … in schema` counts when an earlier
 * migration created anything).
 * @param {string} sql The migration's SQL text.
 * @param {CreatedObjects} earlier What the migrations sorting before it created.
 * @returns {string[]} The flagged statements, shortened; empty when none.
 */
export function flaggedStatements(sql, earlier) {
  const known = new Set([...earlier.tables, ...earlier.views, ...earlier.functions]);
  /** @type {string[]} */
  const flagged = [];
  for (const statement of statements(sql)) {
    const short = statement.length > 70 ? `${statement.slice(0, 67)}...` : statement;
    if (
      /\bdrop\b/i.test(statement) ||
      /^alter\s+policy\b/i.test(statement) ||
      /^alter\b.*\brename\b/i.test(statement)
    ) {
      flagged.push(short);
      continue;
    }
    const revoke =
      /^revoke\b.*?\bon\s+(?:(all\s+\w+\s+in\s+schema\b)|(?:(?:table|function|procedure|routine|view|sequence)\s+)?([\w."]+))/i.exec(
        statement,
      );
    if (!revoke) continue;
    if (revoke[1] ? known.size > 0 : known.has(objectName(revoke[2]))) flagged.push(short);
  }
  return flagged;
}

/**
 * Whether the migration carries a `-- compat: <non-empty text>` line.
 * @param {string} sql The migration's SQL text.
 * @returns {boolean} True when the marker is present with text after the colon.
 */
export function hasCompatMarker(sql) {
  return /^[ \t]*--[ \t]*compat:[ \t]*\S/m.test(sql);
}

/**
 * Parses the output of `git diff --name-status --find-renames`.
 * @param {string} output The command output.
 * @returns {Change[]} One change per line; a rename carries both paths.
 */
export function parseNameStatus(output) {
  /** @type {Change[]} */
  const changes = [];
  for (const line of lines(output)) {
    const fields = line.split("\t");
    const code = fields[0] ?? "";
    if (code.startsWith("R") && fields.length >= 3) {
      changes.push({ status: "R", from: fields[1], path: fields[2] });
    } else if (code === "A" || code === "M" || code === "D") {
      changes.push({ status: code, path: fields[1] ?? "" });
    } else if (code.startsWith("C") && fields.length >= 3) {
      changes.push({ status: "A", path: fields[2] });
    } else if (fields[1]) {
      // T (type change) and anything else: treat as an edit so it cannot slip through.
      changes.push({ status: "M", path: fields[1] });
    }
  }
  return changes;
}

/**
 * Runs the three rules over the migration changes of a PR.
 * @param {GuardInput} input The changes and the file readers.
 * @returns {GuardResult} The violations (each fails the run) and the warnings (each used exception).
 */
export function evaluateGuard(input) {
  /** @type {Finding[]} */
  const violations = [];
  /** @type {Finding[]} */
  const warnings = [];
  const sqlChanges = input.changes.filter((c) => c.path.endsWith(".sql"));

  // Allowlist: append-only, and only the lines new in this PR can authorise anything.
  if (!isAppendOnly(input.baseAllowlist, input.headAllowlist)) {
    violations.push({
      file: ALLOWLIST_PATH,
      message: `The allowlist is append-only: every line present at the base must stay unchanged, in place; add new lines at the end.`,
    });
  }
  const { entries: newEntries, errors } = parseAllowlist(input.headAllowlist, lines(input.baseAllowlist).length + 1);
  violations.push(...errors);
  for (const entry of newEntries) {
    if (entry.reason.length < MIN_REASON_LENGTH) {
      violations.push({
        file: ALLOWLIST_PATH,
        line: entry.line,
        message: `The reason for ${entry.file} has ${entry.reason.length} characters; write at least ${MIN_REASON_LENGTH} (replace the "${ENTRY_PLACEHOLDER}" placeholder with why the merged migration had to change).`,
      });
    }
  }
  /** @type {Set<AllowlistEntry>} */
  const used = new Set();

  // Immutability.
  for (const change of sqlChanges) {
    if (change.status === "D") {
      violations.push({
        file: change.path,
        message: `A merged migration cannot be deleted: the hosted history records it and a missing file breaks "supabase db push". Restore it and undo its effect in a new migration.`,
      });
    } else if (change.status === "R") {
      violations.push({
        file: change.from ?? change.path,
        message: `A merged migration cannot be renamed (${change.from ?? "?"} -> ${change.path}): the hosted history records its name. Restore it and add a new migration instead.`,
      });
    } else if (change.status === "M") {
      const base = input.readBase(change.path);
      const head = input.readHead(change.path);
      if (isCommentOnlyEdit(base, head)) continue;
      const name = path.posix.basename(change.path);
      const hash = sha256(head);
      const matching = newEntries.filter((e) => e.file === name && e.hash === hash);
      if (matching.length === 0) {
        violations.push({
          file: change.path,
          message: `A merged migration is immutable beyond comments and blank lines. Revert the edit and add a new migration, or, when the merged file really has to change, append the line printed by "node scripts/migration-guard.mjs --entry ${change.path}" to ${ALLOWLIST_PATH} with a reason.`,
        });
        continue;
      }
      for (const entry of matching) {
        used.add(entry);
        warnings.push({
          file: change.path,
          message: `Edit of a merged migration allowed by ${ALLOWLIST_PATH}:${entry.line}: ${entry.reason}`,
        });
      }
    }
  }
  for (const entry of newEntries) {
    if (used.has(entry)) continue;
    violations.push({
      file: ALLOWLIST_PATH,
      line: entry.line,
      message: `The entry for ${entry.file} matches no edited migration in this PR: an entry counts only for a file this PR edits beyond comments, with the sha256 of its content at HEAD (no pre-authorisation, no stale entry, and a deleted or renamed file cannot be allowlisted).`,
    });
  }

  // Ordering and marker, for added migrations.
  const baseNames = input.baseMigrations.map((p) => path.posix.basename(p)).sort();
  const newest = baseNames[baseNames.length - 1];
  const added = sqlChanges.filter((c) => c.status === "A").sort((a, b) => a.path.localeCompare(b.path));
  for (const change of added) {
    const name = path.posix.basename(change.path);
    if (newest !== undefined && name <= newest) {
      violations.push({
        file: change.path,
        message: `A new migration must sort after every merged one (newest at the base: ${newest}); "supabase db push" is expected to refuse an older timestamp. Rename it to a newer timestamp (the file is new in this PR, so the rename is free).`,
      });
    }
    const sql = input.readHead(change.path);
    const earlierSqls = [
      ...input.baseMigrations.filter((p) => path.posix.basename(p) < name).map(input.readBase),
      ...added.filter((c) => path.posix.basename(c.path) < name).map((c) => input.readHead(c.path)),
    ];
    const flagged = flaggedStatements(sql, createdObjects(earlierSqls));
    if (flagged.length > 0 && !hasCompatMarker(sql)) {
      violations.push({
        file: change.path,
        message: `This migration drops, alters a policy, renames or revokes on something an earlier migration created (${flagged.join("; ")}). The schema ships before the code and never rolls back, so check that the deployed code still works, then add one line "-- compat: <how the deployed code keeps working>". The check is a heuristic: the marker proves nothing about compatibility.`,
      });
    }
  }

  return { violations, warnings };
}

/**
 * The allowlist line for a migration's current content, with the literal placeholder as the reason (it is shorter than
 * the minimum, so a line committed without editing it fails).
 * @param {string} file The migration's path (relative to the current directory).
 * @returns {string} `<file name> <sha256> <reason>`.
 */
export function allowlistEntryFor(file) {
  return `${path.basename(file)} ${sha256(readFileSync(file, "utf8"))} ${ENTRY_PLACEHOLDER}`;
}

/**
 * Runs git in the current directory and returns its stdout.
 * @param {string[]} args The arguments.
 * @returns {string} The output, untrimmed.
 */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Reads a path at a revision, or "" when the object does not exist there.
 * @param {string} rev The revision.
 * @param {string} file The repo-relative path.
 * @returns {string} The content, or "".
 */
function readAt(rev, file) {
  try {
    execFileSync("git", ["cat-file", "-e", `${rev}:${file}`], { stdio: "ignore" });
  } catch {
    return "";
  }
  return git(["show", `${rev}:${file}`]);
}

/**
 * The annotation for a finding, in the GitHub Actions workflow-command format.
 * @param {"error" | "warning"} level The level.
 * @param {Finding} finding The finding.
 * @returns {string} One line.
 */
function annotation(level, finding) {
  const where = finding.line === undefined ? `file=${finding.file}` : `file=${finding.file},line=${finding.line}`;
  return `::${level} ${where}::${finding.message.replace(/\s*\n\s*/g, " ")}`;
}

/**
 * Parses the CLI arguments.
 * @param {string[]} argv The arguments after the script name.
 * @returns {{ base: string, entry: string | null }} The options.
 */
function parseArgs(argv) {
  let base = DEFAULT_BASE;
  /** @type {string | null} */
  let entry = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base" && argv[i + 1] !== undefined) base = argv[++i];
    else if (arg === "--entry" && argv[i + 1] !== undefined) entry = argv[++i];
    else
      throw new Error(
        `Unknown argument "${arg}". Usage: migration-guard.mjs [--base <ref>] | --entry <migration file>`,
      );
  }
  return { base, entry };
}

function main() {
  const { base, entry } = parseArgs(process.argv.slice(2));
  if (entry !== null) {
    console.log(allowlistEntryFor(entry));
    return 0;
  }
  const mergeBase = git(["merge-base", base, "HEAD"]).trim();
  const changes = parseNameStatus(
    git(["diff", "--name-status", "--find-renames", `${base}...HEAD`, "--", MIGRATIONS_DIR]),
  );
  const baseMigrations = lines(git(["ls-tree", "--name-only", mergeBase, "--", `${MIGRATIONS_DIR}/`]));
  const result = evaluateGuard({
    changes,
    baseMigrations,
    readBase: (file) => readAt(mergeBase, file),
    readHead: (file) => readAt("HEAD", file),
    baseAllowlist: readAt(mergeBase, ALLOWLIST_PATH),
    headAllowlist: readAt("HEAD", ALLOWLIST_PATH),
  });
  for (const warning of result.warnings) console.log(annotation("warning", warning));
  for (const violation of result.violations) console.log(annotation("error", violation));
  const changed = changes.length === 0 ? "no migration changes" : `${changes.length} migration change(s)`;
  console.log(
    `migration guard: ${changed} against ${base}, ${result.violations.length} violation(s), ${result.warnings.length} warning(s)`,
  );
  return result.violations.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
