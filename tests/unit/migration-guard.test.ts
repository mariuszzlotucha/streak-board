// Oracle for the migration guard (scripts/migration-guard.mjs), from the plan of `refactor-opportunities` (OPP-3):
//   - a merged migration may change only in comments and blank lines; any other edit needs a NEW allowlist line with the
//     sha256 of the edited content and a reason of at least 20 characters; delete and rename are never allowed;
//   - a new migration that drops, alters a policy, renames or revokes on an earlier migration's object needs one
//     `-- compat: <text>` line; a revoke on its own objects does not;
//   - a new migration must sort after every migration at the base.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ALLOWLIST_PATH,
  ENTRY_PLACEHOLDER,
  MIGRATIONS_DIR,
  createdObjects,
  evaluateGuard,
  flaggedStatements,
  hasCompatMarker,
  isAppendOnly,
  isCommentOnlyEdit,
  parseAllowlist,
  parseNameStatus,
  sha256,
  type Change,
  type GuardInput,
} from "../../scripts/migration-guard.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const GUARD = path.join(REPO_ROOT, "scripts/migration-guard.mjs");

const BASE_SQL = "-- merged\ncreate table public.groups (\n  id uuid primary key\n);\n";
const BASE_PATH = `${MIGRATIONS_DIR}/20260925003350_create_groups.sql`;
const NEW_PATH = `${MIGRATIONS_DIR}/20261101000000_next.sql`;
const LONG_REASON = "hotfix of the merged file, agreed with the owner";

function input(overrides: Partial<GuardInput> & { head?: Record<string, string> }): GuardInput {
  const head = overrides.head ?? {};
  const files: Record<string, string> = { [BASE_PATH]: BASE_SQL, ...head };
  return {
    changes: [],
    baseMigrations: [BASE_PATH],
    readBase: (file) => (file === BASE_PATH ? BASE_SQL : ""),
    readHead: (file) => files[file] ?? "",
    baseAllowlist: "",
    headAllowlist: "",
    ...overrides,
  };
}

function entry(file: string, content: string, reason: string): string {
  return `${path.posix.basename(file)} ${sha256(content)} ${reason}\n`;
}

describe("comment-only edits", () => {
  it("ignores comments, blank lines, trailing whitespace and line endings", () => {
    const edited =
      "-- rewritten header\r\n\r\ncreate table public.groups (  \r\n  -- the key\r\n  id uuid primary key\r\n);\r\n";
    expect(isCommentOnlyEdit(BASE_SQL, edited)).toBe(true);
  });

  it("sees a statement edit", () => {
    expect(isCommentOnlyEdit(BASE_SQL, BASE_SQL.replace("uuid", "text"))).toBe(false);
  });

  it("keeps a -- inside a string literal", () => {
    const a = "select 'a -- b';\n";
    expect(isCommentOnlyEdit(a, "select 'a -- c';\n")).toBe(false);
    expect(isCommentOnlyEdit(a, "select 'a -- b'; -- note\n")).toBe(true);
  });
});

describe("immutability", () => {
  const statementEdit = BASE_SQL.replace("uuid", "text");
  const edit: Change = { status: "M", path: BASE_PATH };

  it("passes a comment-only edit without an entry", () => {
    const result = evaluateGuard(input({ changes: [edit], head: { [BASE_PATH]: `${BASE_SQL}-- trailing note\n` } }));
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("fails a statement edit without an entry", () => {
    const result = evaluateGuard(input({ changes: [edit], head: { [BASE_PATH]: statementEdit } }));
    expect(result.violations.map((v) => v.file)).toEqual([BASE_PATH]);
    expect(result.violations[0]?.message).toContain("--entry");
  });

  it("fails a delete and a rename even with an entry", () => {
    const headAllowlist = entry(BASE_PATH, statementEdit, LONG_REASON);
    const deleted = evaluateGuard(input({ changes: [{ status: "D", path: BASE_PATH }], headAllowlist }));
    expect(deleted.violations.map((v) => v.file)).toEqual([BASE_PATH, ALLOWLIST_PATH]);
    const renamed = evaluateGuard(
      input({
        changes: [{ status: "R", from: BASE_PATH, path: NEW_PATH }],
        headAllowlist,
        head: { [NEW_PATH]: BASE_SQL },
      }),
    );
    expect(renamed.violations.map((v) => v.file)).toEqual([BASE_PATH, ALLOWLIST_PATH]);
  });

  it("passes a statement edit with a valid new entry and warns", () => {
    const result = evaluateGuard(
      input({
        changes: [edit],
        head: { [BASE_PATH]: statementEdit },
        headAllowlist: `# exceptions\n${entry(BASE_PATH, statementEdit, LONG_REASON)}`,
      }),
    );
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([{ file: BASE_PATH, message: expect.stringContaining(LONG_REASON) as string }]);
  });

  it("authorises nothing with an entry already present at the base", () => {
    const line = entry(BASE_PATH, statementEdit, LONG_REASON);
    const result = evaluateGuard(
      input({ changes: [edit], head: { [BASE_PATH]: statementEdit }, baseAllowlist: line, headAllowlist: line }),
    );
    expect(result.violations.map((v) => v.file)).toEqual([BASE_PATH]);
    expect(result.warnings).toEqual([]);
  });

  it("fails a wrong hash (the entry is unused and the edit unauthorised)", () => {
    const result = evaluateGuard(
      input({
        changes: [edit],
        head: { [BASE_PATH]: statementEdit },
        headAllowlist: entry(BASE_PATH, BASE_SQL, LONG_REASON),
      }),
    );
    expect(result.violations.map((v) => v.file).sort()).toEqual([ALLOWLIST_PATH, BASE_PATH].sort());
  });

  it("fails a reason under 20 characters, the unedited --entry placeholder included", () => {
    for (const reason of [ENTRY_PLACEHOLDER, "nineteen chars long"]) {
      const result = evaluateGuard(
        input({
          changes: [edit],
          head: { [BASE_PATH]: statementEdit },
          headAllowlist: entry(BASE_PATH, statementEdit, reason),
        }),
      );
      expect(result.violations).toEqual([
        { file: ALLOWLIST_PATH, line: 1, message: expect.stringContaining("20") as string },
      ]);
    }
    const ok = evaluateGuard(
      input({
        changes: [edit],
        head: { [BASE_PATH]: statementEdit },
        headAllowlist: entry(BASE_PATH, statementEdit, "exactly twenty chars"),
      }),
    );
    expect(ok.violations).toEqual([]);
  });

  it("fails a non-append-only allowlist change", () => {
    const old = entry(BASE_PATH, BASE_SQL, "an older, already merged exception line");
    const result = evaluateGuard(
      input({
        changes: [edit],
        head: { [BASE_PATH]: statementEdit },
        baseAllowlist: old,
        headAllowlist: `# moved\n${old}${entry(BASE_PATH, statementEdit, LONG_REASON)}`,
      }),
    );
    expect(result.violations.map((v) => v.file)).toContain(ALLOWLIST_PATH);
    expect(result.violations.some((v) => v.message.includes("append-only"))).toBe(true);
  });

  it("fails an entry for an unedited file and an entry for a comment-only edit", () => {
    const unedited = evaluateGuard(input({ headAllowlist: entry(BASE_PATH, BASE_SQL, LONG_REASON) }));
    expect(unedited.violations.map((v) => v.file)).toEqual([ALLOWLIST_PATH]);
    const commentOnly = `${BASE_SQL}-- note\n`;
    const result = evaluateGuard(
      input({
        changes: [edit],
        head: { [BASE_PATH]: commentOnly },
        headAllowlist: entry(BASE_PATH, commentOnly, LONG_REASON),
      }),
    );
    expect(result.violations.map((v) => v.file)).toEqual([ALLOWLIST_PATH]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects a malformed line and ignores comments and blank lines", () => {
    const parsed = parseAllowlist(
      `# header\n\nfoo.sql nothash ${LONG_REASON}\n${entry(BASE_PATH, BASE_SQL, LONG_REASON)}`,
    );
    expect(parsed.errors.map((e) => e.line)).toEqual([3]);
    expect(parsed.entries).toEqual([
      { line: 4, file: path.posix.basename(BASE_PATH), hash: sha256(BASE_SQL), reason: LONG_REASON },
    ]);
    expect(isAppendOnly("a\nb\n", "a\nb\nc\n")).toBe(true);
    expect(isAppendOnly("a\nb\n", "a\nc\n")).toBe(false);
    expect(isAppendOnly("", "anything\n")).toBe(true);
  });
});

describe("marker", () => {
  const earlier = createdObjects([
    "create table public.groups (id uuid);\ncreate function public.is_member(p uuid) returns boolean language sql as $$ select true $$;\ncreate view public.v as select 1;",
  ]);
  const none = createdObjects([]);

  it("flags drop policy, alter policy, a rename and a revoke on an earlier table", () => {
    expect(flaggedStatements('drop policy "x" on public.groups;', none)).toHaveLength(1);
    expect(flaggedStatements('alter policy "x" on public.groups using (true);', none)).toHaveLength(1);
    expect(flaggedStatements("alter table public.groups rename column name to title;", none)).toHaveLength(1);
    expect(flaggedStatements("revoke all on public.groups from anon;", earlier)).toHaveLength(1);
    expect(flaggedStatements("revoke execute on function public.is_member (uuid) from public;", earlier)).toHaveLength(
      1,
    );
    expect(flaggedStatements("revoke select on public.v from anon;", earlier)).toHaveLength(1);
    expect(flaggedStatements("revoke all on all tables in schema public from anon;", earlier)).toHaveLength(1);
  });

  it("does not flag a revoke on the migration's own table or function", () => {
    const own =
      "create table public.tasks (id uuid);\nrevoke all on public.tasks from anon;\ncreate function public.f() returns void language sql as $$ select 1 $$;\nrevoke execute on function public.f () from public, anon;\ngrant select on public.tasks to authenticated;";
    expect(flaggedStatements(own, earlier)).toEqual([]);
    expect(flaggedStatements("revoke all on all tables in schema public from anon;", none)).toEqual([]);
  });

  it("ignores drop inside comments and strings", () => {
    expect(flaggedStatements("-- we drop nothing here\nselect 'drop';", none)).toEqual([]);
  });

  it("needs text after compat:", () => {
    expect(hasCompatMarker("-- compat: the deployed code never calls it\nselect 1;")).toBe(true);
    expect(hasCompatMarker("  --compat:   text\n")).toBe(true);
    expect(hasCompatMarker("-- compat:\nselect 1;")).toBe(false);
    expect(hasCompatMarker("-- compat:   \nselect 1;")).toBe(false);
    expect(hasCompatMarker("select 1;")).toBe(false);
  });

  it("fails an added destructive migration without the marker and passes it with one", () => {
    const destructive = "revoke all on public.groups from anon;\n";
    const fail = evaluateGuard(
      input({ changes: [{ status: "A", path: NEW_PATH }], head: { [NEW_PATH]: destructive } }),
    );
    expect(fail.violations).toEqual([{ file: NEW_PATH, message: expect.stringContaining("compat") as string }]);
    const pass = evaluateGuard(
      input({
        changes: [{ status: "A", path: NEW_PATH }],
        head: { [NEW_PATH]: `-- compat: anon never reads groups\n${destructive}` },
      }),
    );
    expect(pass.violations).toEqual([]);
  });

  it("sees objects created by another migration added in the same PR", () => {
    const first = `${MIGRATIONS_DIR}/20261101000000_a.sql`;
    const second = `${MIGRATIONS_DIR}/20261101000001_b.sql`;
    const result = evaluateGuard(
      input({
        changes: [
          { status: "A", path: second },
          { status: "A", path: first },
        ],
        head: { [first]: "create table public.t (id uuid);", [second]: "revoke all on public.t from anon;" },
      }),
    );
    expect(result.violations.map((v) => v.file)).toEqual([second]);
  });
});

describe("ordering", () => {
  it("fails an added migration older than the newest at the base and passes a newer one", () => {
    const older = `${MIGRATIONS_DIR}/20260101000000_old.sql`;
    const fail = evaluateGuard(input({ changes: [{ status: "A", path: older }], head: { [older]: "select 1;" } }));
    expect(fail.violations).toEqual([{ file: older, message: expect.stringContaining("newer timestamp") as string }]);
    const pass = evaluateGuard(
      input({ changes: [{ status: "A", path: NEW_PATH }], head: { [NEW_PATH]: "select 1;" } }),
    );
    expect(pass.violations).toEqual([]);
  });

  it("passes any name when the base has no migrations", () => {
    const older = `${MIGRATIONS_DIR}/20260101000000_old.sql`;
    const result = evaluateGuard(
      input({ baseMigrations: [], changes: [{ status: "A", path: older }], head: { [older]: "select 1;" } }),
    );
    expect(result.violations).toEqual([]);
  });
});

describe("git name-status parsing", () => {
  it("reads A, M, D and renames", () => {
    expect(parseNameStatus("A\ta.sql\nM\tb.sql\nD\tc.sql\nR100\told.sql\tnew.sql\n")).toEqual([
      { status: "A", path: "a.sql" },
      { status: "M", path: "b.sql" },
      { status: "D", path: "c.sql" },
      { status: "R", from: "old.sql", path: "new.sql" },
    ]);
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("the merged migrations (fixed list at c9f6451)", () => {
  // Not a directory glob: the first later migration that is flagged and carries a marker would turn a glob red.
  const NAMES = [
    "20260925003350_create_groups_and_group_members.sql",
    "20260925011727_harden_group_rls.sql",
    "20260925161234_add_group_member_list_and_preview.sql",
    "20260930120000_create_tasks.sql",
    "20261001090000_create_task_participants.sql",
    "20261001120000_harden_table_privileges.sql",
    "20261002090000_create_task_checkoffs.sql",
  ];

  it("needs a marker exactly for harden_group_rls and harden_table_privileges", () => {
    const dir = path.join(REPO_ROOT, MIGRATIONS_DIR);
    const sql = new Map(NAMES.map((name) => [name, readFileSync(path.join(dir, name), "utf8")]));
    const flagged = NAMES.filter((name, i) => {
      const earlier = createdObjects(NAMES.slice(0, i).map((n) => sql.get(n) ?? ""));
      return flaggedStatements(sql.get(name) ?? "", earlier).length > 0;
    });
    expect(flagged).toEqual(["20260925011727_harden_group_rls.sql", "20261001120000_harden_table_privileges.sql"]);
  });
});

describe("end to end against a throwaway git repository", () => {
  let repo = "";
  // A CI runner has no git identity, and the developer's global config must not leak in.
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "guard test",
    GIT_AUTHOR_EMAIL: "guard@example.invalid",
    GIT_COMMITTER_NAME: "guard test",
    GIT_COMMITTER_EMAIL: "guard@example.invalid",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), content);
  };
  const commitAll = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  const scenario = (name: string, mutate: () => void) => {
    git("checkout", "-q", "-b", name, "main");
    mutate();
    commitAll(name);
  };
  const guard = (): { status: number; output: string } => {
    try {
      const output = execFileSync(process.execPath, [GUARD, "--base", "main"], { cwd: repo, env, encoding: "utf8" });
      return { status: 0, output };
    } catch (error) {
      const failure = error as { status: number | null; stdout: string };
      return { status: failure.status ?? -1, output: failure.stdout };
    }
  };

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "migration-guard-"));
    git("init", "-q", "-b", "main");
    write(BASE_PATH, BASE_SQL);
    commitAll("base");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("passes a comment edit", () => {
    scenario("comment-edit", () => {
      write(BASE_PATH, `-- a better header\n${BASE_SQL}`);
    });
    expect(guard()).toEqual({ status: 0, output: expect.stringContaining("0 violation(s)") as string });
  });

  it("fails a statement edit", () => {
    scenario("statement-edit", () => {
      write(BASE_PATH, BASE_SQL.replace("uuid", "text"));
    });
    const result = guard();
    expect(result.status).toBe(1);
    expect(result.output).toContain(`::error file=${BASE_PATH}::`);
  });

  it("passes an allowlisted edit with the hash --entry prints, and warns", () => {
    const edited = BASE_SQL.replace("uuid", "text");
    scenario("allowlisted-edit", () => {
      write(BASE_PATH, edited);
      const line = execFileSync(process.execPath, [GUARD, "--entry", BASE_PATH], {
        cwd: repo,
        env,
        encoding: "utf8",
      }).trim();
      expect(line).toBe(`${path.posix.basename(BASE_PATH)} ${sha256(edited)} ${ENTRY_PLACEHOLDER}`);
      write(ALLOWLIST_PATH, `${line.replace(ENTRY_PLACEHOLDER, LONG_REASON)}\n`);
    });
    const result = guard();
    expect(result.status).toBe(0);
    expect(result.output).toContain(`::warning file=${BASE_PATH}::`);
    expect(result.output).toContain(LONG_REASON);
  });

  it("fails an added destructive migration without a marker", () => {
    scenario("destructive-add", () => {
      write(NEW_PATH, "revoke all on public.groups from anon;\n");
    });
    const result = guard();
    expect(result.status).toBe(1);
    expect(result.output).toContain(`::error file=${NEW_PATH}::`);
    expect(result.output).toContain("compat");
  });
});
