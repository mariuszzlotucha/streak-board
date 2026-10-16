# Mutation baseline

The first measurement of the unit tests with Stryker (`npm run test:mutation`, see README, Tests, Mutation testing) on the 14 rule and mapping modules in `stryker.config.json`, one run per module with the local Supabase stack stopped (the unit project needs none). Recorded in S-10 `test-coverage`, Phase 5. The JSON reports are not committed (`reports/` is gitignored); every number here is copied from `reports/mutation/mutation.json` right after the run that produced it, and the wall time from the run's `Done in N seconds` line.

How to read it:

- **Score** is Stryker's: detected (killed + timeout) over detected + undetected (survived + no coverage). A runtime error or compile error is in neither.
- **Survivor verdicts.** `equivalent`: the mutant cannot change observable behaviour (the reason is given). `unobservable`: it changes an internal step with no user-visible or business-relevant effect. `import-time throw`: a static mutant with `testsCompleted: 0` that breaks the module at import (the test files that import it never load, so Stryker reports it as survived instead of killed). `fixed by <describe > test name>`: the assertion added in this phase that kills it; the expected value was written from the PRD, README, `supabase/config.toml` or the module's own comment, never from the mutant's output.
- **Re-run rule.** Re-run a module's mutation when its rule or its test file changes, compare with its row, and treat a lower score as a review finding to explain (a new equivalent mutant is an explanation; a new killable survivor is a weak test).
- The five modules whose tests gained an assertion were run twice: the table shows the second run, the first run's score is in the "First run" column.

## Table (2026-10-16)

| Module              | Mutants |  Killed | Survived | No coverage | Runtime errors | Timeouts |       Score | First run | Wall time |
| ------------------- | ------: | ------: | -------: | ----------: | -------------: | -------: | ----------: | --------: | --------: |
| `auth-errors`       |     109 |     106 |        3 |           0 |              0 |        0 |     97.25 % |   82.57 % |       6 s |
| `auth-state`        |      60 |      60 |        0 |           0 |              0 |        0 |    100.00 % |   95.00 % |       5 s |
| `checkoff-client`   |      72 |      67 |        3 |           0 |              0 |        2 |     95.83 % |         — |      10 s |
| `checkoff-response` |      27 |      27 |        0 |           0 |              0 |        0 |    100.00 % |         — |       3 s |
| `checkoff-sync`     |      10 |      10 |        0 |           0 |              0 |        0 |    100.00 % |         — |       2 s |
| `group-errors`      |      30 |      29 |        1 |           0 |              0 |        0 |     96.67 % |         — |       5 s |
| `group-rules`       |      64 |      63 |        1 |           0 |              0 |        0 |     98.44 % |         — |       6 s |
| `join-code`         |      13 |      13 |        0 |           0 |              0 |        0 |    100.00 % |   92.31 % |       3 s |
| `landing`           |      15 |      14 |        1 |           0 |              0 |        0 |     93.33 % |         — |       3 s |
| `leaderboard-rules` |      75 |      70 |        4 |           1 |              0 |        0 |     93.33 % |   92.00 % |       6 s |
| `nickname-errors`   |      26 |      25 |        1 |           0 |              0 |        0 |     96.15 % |         — |     6 s ¹ |
| `nickname-rules`    |      83 |      82 |        1 |           0 |              0 |        0 |     98.80 % |         — |     6 s ² |
| `nicknames`         |      18 |      18 |        0 |           0 |              0 |        0 |    100.00 % |         — |     6 s ¹ |
| `redact`            |      21 |      21 |        0 |           0 |              0 |        0 |    100.00 % |         — |       7 s |
| `streak-rules`      |     130 |     107 |       23 |           0 |              0 |        0 |     82.31 % |         — |      23 s |
| `task-errors`       |      16 |      15 |        1 |           0 |              0 |        0 |     93.75 % |         — |       3 s |
| `task-rules`        |      31 |      31 |        0 |           0 |              0 |        0 |    100.00 % |   87.10 % |       4 s |
| **All 17**          | **800** | **758** |   **39** |       **1** |          **0** |    **2** | **95.00 %** |           |           |

¹ Added in S-14 `nickname` (2026-10-16), measured in one narrowed run together with `leaderboard-rules.ts:52-66` (see "S-14 re-run" below); the wall time is that run's.

² Re-measured alone after the Phase 1 impl review (F3, 2026-10-16) added the visible-character rule: `npm run test:mutation -- --mutate src/lib/nickname-rules.ts --logLevel info`. The 23 mutants of the S-14 re-run below are a subset; the new ones are the two code-point range lists and the pattern builder.

Every runtime mutant that was not `NoCoverage` ran at least one test (`testsCompleted >= 1`), with two kinds of exception, both listed under their module: the five static mutants of `streak-rules` that throw at import (verdict `import-time throw`) and the two `Timeout` mutants of `checkoff-client`, which are detected, not survived (the test that catches them never settles, so no test completes).

## S-14 re-run (2026-10-16)

S-14 `nickname`, Phase 1, added three modules (`nickname-rules`, `nickname-errors`, `nicknames`) and changed the tie-break of `rankStandings` from the e-mail to the nickname. One narrowed run covered all four, with the stack running (the unit project does not use it):

```bash
npm run test:mutation -- --mutate "src/lib/nickname-rules.ts,src/lib/nickname-errors.ts,src/lib/nicknames.ts,src/lib/leaderboard-rules.ts:52-66" --logLevel info
```

`--mutate` takes one comma-separated list: repeated `--mutate` flags keep only the last one. Lines 52-66 of `leaderboard-rules.ts` are `rankStandings` after this change (lines 49-63 before it, when the `UNKNOWN_MEMBER` comment was one line).

| Scope                     | Mutants | Killed | Survived | No coverage | Runtime errors | Timeouts |       Score | Wall time |
| ------------------------- | ------: | -----: | -------: | ----------: | -------------: | -------: | ----------: | --------: |
| `leaderboard-rules:52-66` |      25 |     25 |        0 |           0 |              0 |        0 |    100.00 % |           |
| `nickname-errors`         |      26 |     25 |        1 |           0 |              0 |        0 |     96.15 % |           |
| `nickname-rules`          |      23 |     23 |        0 |           0 |              0 |        0 |    100.00 % |           |
| `nicknames`               |      18 |     18 |        0 |           0 |              0 |        0 |    100.00 % |           |
| **The run**               |  **92** | **91** |    **1** |       **0** |          **0** |    **0** | **98.91 %** |   **6 s** |

Every covered mutant ran at least one test (`testsCompleted >= 1`), checked in `reports/mutation/mutation.json` right after the run. The `leaderboard-rules` row of the table above (the whole module, S-10) is not replaced: the 25 mutants of `rankStandings` were all killed again, including the new tie-break cases (`rankStandings > orders 'Kasia' and 'kasia' (two different nicknames) by user id, whatever the input order` and `rankStandings > sorts a missing nickname exactly where 'Unknown member' would sort`).

## Survivors by module

Columns: mutant id (as in `mutation.json`), line, mutator, what it replaces, verdict. Static mutants are marked `(static)`.

### `auth-errors`

| Id    | Line | Mutator                               | Replaces                                               | Verdict                                                                                                                                       |
| ----- | ---: | ------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 22    |   37 | ConditionalExpression                 | `param !== null` → `true`                              | equivalent: `Object.hasOwn(SIGN_IN_ERROR_MESSAGES, null)` looks up the key `"null"`, which does not exist, so `null` still resolves to `null` |
| 34    |   53 | ConditionalExpression                 | `error.code !== undefined` → `true`                    | equivalent: `STALE_EXCHANGE_CODES.includes(undefined)` is `false`, so a missing code is still not stale                                       |
| 106   |  112 | ConditionalExpression                 | `param !== null` → `true`                              | equivalent: as 22, for `SIGN_UP_ERRORS`                                                                                                       |
| 2     |   15 | StringLiteral (static)                | `email_not_confirmed` message → `""`                   | fixed by `resolveSignInError > pins the user-facing wording of %s`                                                                            |
| 3     |   16 | StringLiteral (static)                | `link_expired` message → `""`                          | fixed by `resolveSignInError > pins the user-facing wording of %s`                                                                            |
| 6     |   19 | StringLiteral (static)                | `rate_limited` message → `""`                          | fixed by `resolveSignInError > pins the user-facing wording of %s`                                                                            |
| 7     |   20 | StringLiteral (static)                | `not_configured` message → `""`                        | fixed by `resolveSignInError > pins the user-facing wording of %s`                                                                            |
| 8     |   21 | StringLiteral (static)                | `unknown` message → `""`                               | fixed by `resolveSignInError > pins the user-facing wording of %s`                                                                            |
| 72–74 |   85 | ObjectLiteral, StringLiteral (static) | `weak_password` resolution → `{}`, its message → `""`  | fixed by `resolveSignUpError > pins the message and field of %s` (the minimum, 6, is `minimum_password_length` in `supabase/config.toml`)     |
| 75–76 |   86 | ObjectLiteral, StringLiteral (static) | `invalid_input` resolution → `{}`, its message → `""`  | fixed by `resolveSignUpError > pins the message and field of %s`                                                                              |
| 77–78 |   87 | ObjectLiteral, StringLiteral (static) | `rate_limited` resolution → `{}`, its message → `""`   | fixed by `resolveSignUpError > pins the message and field of %s`                                                                              |
| 79–80 |   88 | ObjectLiteral, StringLiteral (static) | `not_configured` resolution → `{}`, its message → `""` | fixed by `resolveSignUpError > pins the message and field of %s`                                                                              |
| 81–82 |   89 | ObjectLiteral, StringLiteral (static) | `unknown` resolution → `{}`, its message → `""`        | fixed by `resolveSignUpError > pins the message and field of %s`                                                                              |

### `auth-state`

| Id  | Line | Mutator                | Replaces                                                                 | Verdict                                                                                                                                                         |
| --- | ---: | ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38  |   39 | LogicalOperator        | `error.code && SESSION_GONE_CODES.has(error.code)` → `error.code \|\| …` | fixed by `resolveAuthState > is unexpected for a 4xx with a code that does not mean the session is gone` (any coded 4xx would have become a silent `anonymous`) |
| 5   |   20 | StringLiteral (static) | `"refresh_token_already_used"` → `""`                                    | fixed by `resolveAuthState > is anonymous for a 401 %s` (the row for this code)                                                                                 |
| 7   |   22 | StringLiteral (static) | `"no_authorization"` → `""`                                              | fixed by `resolveAuthState > is anonymous for a 401 %s` (the row for this code)                                                                                 |

### `checkoff-client`

| Id  | Line | Mutator               | Replaces                           | Verdict                                                                                                                                                                                    |
| --- | ---: | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 22  |   52 | EqualityOperator      | `response.status >= 300` → `> 300` | unobservable: only status 300 changes (`failed` instead of `expired`); the middleware redirects with 302 and no route answers 300                                                          |
| 47  |   59 | ConditionalExpression | `body?.ok !== true` → `false`      | unobservable: only a 200 body with `ok: false` and a string `period` changes (`saved` instead of `failed`); the routes send `period` only with `ok: true` (`src/lib/checkoff-response.ts`) |
| 49  |   59 | OptionalChaining      | `body?.ok` → `body.ok`             | equivalent: a `null` body throws instead of failing the comparison, and the `catch` turns the throw into the same `failed`                                                                 |

Detected by timeout, not survived: mutants 1 (line 34, the timer's callback emptied) and 2 (line 35, `controller.abort()` removed) make the request never settle, so `sendCheckoff > fails when no answer comes within 15 seconds, and aborts the request` runs past Vitest's limit and Stryker reports `Timeout` with `testsCompleted: 0`. That is the test catching the mutant, not the Phase 1 failure mode (a survived mutant that no test ran against).

### `checkoff-response`

No survivors.

### `checkoff-sync`

No survivors.

### `group-errors`

| Id  | Line | Mutator               | Replaces                  | Verdict                                                                                                                             |
| --- | ---: | --------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 26  |   31 | ConditionalExpression | `param !== null` → `true` | equivalent: `Object.hasOwn(GROUP_ERROR_MESSAGES, null)` looks up `"null"`, which does not exist, so `null` still resolves to `null` |

### `group-rules`

| Id  | Line | Mutator               | Replaces                              | Verdict                                                                                                                                                                                                                                                                     |
| --- | ---: | --------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 59  |   45 | ConditionalExpression | `typeof input !== "string"` → `false` | equivalent: a non-string then goes through `UUID_PATTERN.test`, which stringifies it (`"undefined"`, `"null"`, `"[object Object]"`, `"[object File]"`, a number) and never matches a UUID, so it is still rejected; `FormData.get` yields only a string, a `File` or `null` |

### `join-code`

| Id  | Line | Mutator                | Replaces             | Verdict                                                                                                                                                                     |
| --- | ---: | ---------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   |    4 | StringLiteral (static) | `"join_code"` → `""` | fixed by `rememberJoinCode > stores a normalised code with path /, httpOnly, lax and a one-hour age` (`JOIN_CODE_COOKIE` is `join_code`, the name the README and smoke use) |

### `landing`

| Id  | Line | Mutator               | Replaces                      | Verdict                                                                                                                     |
| --- | ---: | --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 12  |   16 | ConditionalExpression | `errorCode !== null` → `true` | equivalent: `FLOW_STATE_ERRORS.includes(null)` is `false`, so a request without `error_code` still renders the landing page |

### `leaderboard-rules`

| Id  | Line | Mutator                        | Replaces                                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---: | ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  |   42 | EqualityOperator               | `a < b` → `a <= b` in `compareCodeUnits`                            | fixed by `rankStandings > orders two members without a nickname by user id, whatever the input order` (equal names made the comparator answer `-1` both ways, so two "Unknown member" rows kept their input order instead of the user-id order)                                                                                                                           |
| 60  |  126 | ArrayDeclaration (no coverage) | `participantsByTask.get(task.id) ?? []` → `?? ["Stryker was here"]` | equivalent: the substituted id is no member, so `totalByUser.get` is `undefined` and the loop skips it; no test has a task without participants, so the fallback is uncovered                                                                                                                                                                                             |
| 54  |  121 | ConditionalExpression          | `currentPeriod === undefined` → `true`                              | unobservable: `periodKeyFor` is recomputed for every task instead of once per recurrence; same keys                                                                                                                                                                                                                                                                       |
| 58  |  123 | CallExpression                 | `currentPeriods.set(…)` removed                                     | unobservable: the per-recurrence memo stays empty, so the key is recomputed; same keys                                                                                                                                                                                                                                                                                    |
| 63  |  128 | ConditionalExpression          | `total === undefined` → `false`                                     | unobservable: a participant who is no member gets a `NaN` entry in `totalByUser`, but `totals` is built from `members` and the viewer is always a member, so neither the totals nor `viewerTasks` change                                                                                                                                                                  |
| 2   |   20 | ConditionalExpression (static) | `if (byUser)` → `if (true)` in `groupPeriodsByEnrolment`            | import-time throw (collection-time): the first row of a task now calls `undefined.set` and throws; `tests/unit/leaderboard-rules.test.ts` calls `groupPeriodsByEnrolment` in a `describe` body, so the file fails to load and its 21 tests never run; the 15 `testsCompleted` are `dashboard-data.test.ts`'s, which passed, and Stryker reports the lost file as survived |

### `nickname-errors`

| Id  | Line | Mutator               | Replaces                  | Verdict                                                                                                                                |
| --- | ---: | --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 48  |   27 | ConditionalExpression | `param !== null` → `true` | equivalent: `Object.hasOwn(NICKNAME_ERROR_MESSAGES, null)` looks up `"null"`, which does not exist, so `null` still resolves to `null` |

### `nickname-rules`

| Id  | Line | Mutator               | Replaces                               | Verdict                                                                                                          |
| --- | ---: | --------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 45  |   68 | ConditionalExpression | `from === to` → `false` in `charClass` | equivalent: a one-code-point range is written `\u{x}-\u{x}` instead of `\u{x}`, which matches the same character |

### `redact`

No survivors.

### `streak-rules`

| Id    |  Line | Mutator                | Replaces                                                     | Verdict                                                                                                                                                                             |
| ----- | ----: | ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     |     7 | StringLiteral (static) | `APP_TIME_ZONE = "Europe/Warsaw"` → `""`                     | import-time throw: `new Intl.DateTimeFormat` at module scope throws `RangeError: Invalid time zone specified`; `testsCompleted: 0`                                                  |
| 1     |    17 | StringLiteral (static) | locale `"en-US"` → `""`                                      | import-time throw: `RangeError: Incorrect locale information provided`; `testsCompleted: 0`                                                                                         |
| 3     |    19 | StringLiteral (static) | `year: "numeric"` → `""`                                     | import-time throw: `RangeError: Value out of range for Intl.DateTimeFormat options property year`; `testsCompleted: 0`                                                              |
| 4     |    20 | StringLiteral (static) | `month: "2-digit"` → `""`                                    | import-time throw: as 3, for `month`; `testsCompleted: 0`                                                                                                                           |
| 5     |    21 | StringLiteral (static) | `day: "2-digit"` → `""`                                      | import-time throw: as 3, for `day`; `testsCompleted: 0`                                                                                                                             |
| 22–24 | 43–45 | StringLiteral          | `let year = ""` (and `month`, `day`) → `"Stryker was here!"` | equivalent: `formatToParts` always yields a year, month and day part, so the initial values are overwritten before use                                                              |
| 52    |    70 | ConditionalExpression  | `value <= 0` → `false`                                       | equivalent: for `value === 0` the fall-through gives `floor(0 / 2^m) = 0`; a negative streak never exists (`snapshotOf` builds values from `+ 1`)                                   |
| 53    |    70 | EqualityOperator       | `value <= 0` → `value < 0`                                   | equivalent: as 52                                                                                                                                                                   |
| 56    |    71 | ConditionalExpression  | `missedPeriods <= 0` → `false`                               | equivalent: for 0 misses the fall-through gives `floor(value / 1) = value`; a negative miss count never exists (both callers subtract 1 from a positive period distance)            |
| 57    |    71 | EqualityOperator       | `missedPeriods <= 0` → `missedPeriods < 0`                   | equivalent: as 56                                                                                                                                                                   |
| 60    |    73 | ConditionalExpression  | `missedPeriods >= 53` → `false`                              | equivalent: the early return is a shortcut; `floor(value / 2^m)` is 0 for every safe integer `value` once `m >= 53`, and `2 ** m` is `Infinity` (so the quotient 0) for `m >= 1024` |
| 61    |    73 | EqualityOperator       | `missedPeriods >= 53` → `> 53`                               | equivalent: as 60, for `m = 53` (`floor((2^53 - 1) / 2^53) = 0`)                                                                                                                    |
| 79    |   105 | UnaryOperator          | `previous = -Infinity` → `+Infinity`                         | unobservable: the first key compares below `+Infinity`, so `ascending` turns false and the array is sorted even when it already was; same order                                     |
| 80    |   106 | BooleanLiteral         | `ascending = true` → `false`                                 | unobservable: always sorts; same order                                                                                                                                              |
| 82    |   110 | ConditionalExpression  | `day < previous` → `true`                                    | unobservable: always sorts; same order                                                                                                                                              |
| 84    |   110 | EqualityOperator       | `day < previous` → `day <= previous`                         | unobservable: a repeated key also triggers the sort; same order                                                                                                                     |
| 85    |   110 | EqualityOperator       | `day < previous` → `day >= previous`                         | unobservable: the first key is `>= -Infinity`, so every input is sorted; same order                                                                                                 |
| 89    |   114 | ConditionalExpression  | `if (!ascending)` → `if (true)`                              | unobservable: always sorts; same order                                                                                                                                              |
| 110   |   128 | ConditionalExpression  | `baseDay === null` → `false`                                 | equivalent: with no base `value` is 0 and `decayStreak(0, anything)` is 0, so the first checked period still gives 1                                                                |
| 123   |   144 | ConditionalExpression  | `recurrence === "once"` → `false`                            | equivalent: a `once` snapshot has no base (`snapshotOf` line 101), so the daily path gives `decayed = 0` and the same `checked ? 1 : 0`                                             |
| 125   |   144 | StringLiteral          | `"once"` → `""`                                              | equivalent: as 123 (the comparison is never true)                                                                                                                                   |

### `task-errors`

| Id  | Line | Mutator               | Replaces                  | Verdict                                                                                                                            |
| --- | ---: | --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 13  |   19 | ConditionalExpression | `param !== null` → `true` | equivalent: `Object.hasOwn(TASK_ERROR_MESSAGES, null)` looks up `"null"`, which does not exist, so `null` still resolves to `null` |

### `task-rules`

| Id  |  Line | Mutator                | Replaces                               | Verdict                                                                                                     |
| --- | ----: | ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0   |    12 | ObjectLiteral (static) | `RECURRENCE_LABELS` → `{}`             | fixed by `RECURRENCE_LABELS > labels each recurrence kind of the add-task select with its capitalised name` |
| 1–3 | 13–15 | StringLiteral (static) | `"Once"`, `"Daily"`, `"Weekly"` → `""` | fixed by `RECURRENCE_LABELS > labels each recurrence kind of the add-task select with its capitalised name` |

## Assertions added in this phase

| Test file                              | Test                                                                                                                           | Kills                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `tests/unit/auth-errors.test.ts`       | `resolveSignInError > pins the user-facing wording of %s` (8 rows)                                                             | `auth-errors` 2, 3, 6, 7, 8 |
| `tests/unit/auth-errors.test.ts`       | `resolveSignUpError > pins the message and field of %s` (6 rows)                                                               | `auth-errors` 72–82         |
| `tests/unit/auth-state.test.ts`        | `resolveAuthState > is anonymous for a 401 %s` (two rows added: `refresh_token_already_used`, `no_authorization`)              | `auth-state` 5, 7           |
| `tests/unit/auth-state.test.ts`        | `resolveAuthState > is unexpected for a 4xx with a code that does not mean the session is gone`                                | `auth-state` 38             |
| `tests/unit/join-code.test.ts`         | `rememberJoinCode > stores a normalised code with path /, httpOnly, lax and a one-hour age` (the `JOIN_CODE_COOKIE` assertion) | `join-code` 0               |
| `tests/unit/task-rules.test.ts`        | `RECURRENCE_LABELS > labels each recurrence kind of the add-task select with its capitalised name`                             | `task-rules` 0–3            |
| `tests/unit/leaderboard-rules.test.ts` | `rankStandings > orders two members without a nickname by user id, whatever the input order`                                   | `leaderboard-rules` 12      |

Not fixed on purpose: every `equivalent` and `unobservable` mutant above, the uncovered fallback in `buildBoard` (no business rule turns on it) and the static mutants that break loading (`streak-rules` 0, 1, 3, 4 and 5 at import, `leaderboard-rules` 2 at collection), which no assertion can reach without changing `src/` or restructuring the test file for the tool's sake.
