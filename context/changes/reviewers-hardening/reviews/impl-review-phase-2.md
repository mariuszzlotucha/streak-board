<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Reviewers hardening after PR #225 and #226

- **Plan**: context/changes/reviewers-hardening/plan.md
- **Scope**: Phase 2 of 2
- **Reviewed phases**: 2
- **Date**: 2026-10-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria re-run on commit 31e1fa7: `npm run test:unit -- tests/unit/code-reviewer-evals.test.ts` 29 passed, `npm run lint` clean, `npm run --prefix packages/code-reviewer/evals validate` 3 valid configs, `grep -rn "15 cases" README.md packages/code-reviewer` empty. Manual rows 2.5–2.7 ticked with the evidence in `eval-results.md` (0.836 USD, 16/16, `pr-103` 13,510 reasoning tokens, no `length`); 2.8 is the owner's merge.

## Findings

### F1 — The case's rubric asks for English rationales, but the grader never sees them

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/evals/cases/non-english-input.yaml (rubric), README.md:520, packages/code-reviewer/README.md:214
- **Detail**: The `llm-rubric` uses `transform: output.summary`, so the grader sees the summary text (summary, findings, "Not verified") and not the per-criterion `rationale` fields (`schemas/review-result.ts:26`), yet the rubric says "the rationales ... is English" and the docs say the sentence is guarded for "summary, findings, rationales". The case therefore checks the summary and the findings; the rationale fields, which the sentence also covers, are not graded by any case.
- **Fix**: State the limit where the claim is made: add it to the case header comment and to the READMEs' wording ("the summary and the findings; the `rationale` fields are not graded"), and keep the rubric text as it was measured. Strength: free, no re-run, and the rubric that passed in step a2 stays the one on record. Tradeoff: the case stays weaker than its rubric reads. Confidence: HIGH — `transform: output.summary` is the documented rule for every `llm-rubric` here. Blind spot: whether the model writes rationales in Japanese is still unmeasured.
- **Decision**: FIXED (Fix now): the limit is stated in the case header comment, `README.md`, `packages/code-reviewer/README.md` and `evals/README.md`; the rubric text is unchanged, so no re-run.

### F2 — Stale "15 cases" outside the grep of criterion 2.4

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/lessons.md:213, context/foundation/roadmap.md:142
- **Detail**: Both lines still describe the suite as 15 cases ("15 cases" in the lesson's Context, "około 1 USD za przebieg 15 przypadków" in the roadmap). The plan keeps `lessons.md:213` on purpose ("a lesson text outside the grep") and the grep of 2.4 covers only the READMEs, so this is not a miss, but the lesson now names the wrong size of the suite it tells people to run.
- **Fix**: Change "15 cases" to "16 cases" in `lessons.md:213` only; leave the roadmap estimate, which is a dated cost figure.
- **Decision**: FIXED (Fix now): `lessons.md:213` says 16 cases; the roadmap estimate stays.

### F3 — "Guards" says more than one run of one case shows

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: README.md:520, packages/code-reviewer/README.md:214, packages/code-reviewer/evals/README.md:95
- **Detail**: The READMEs say the case "guards" the #226 sentence. The evidence is one run of one case, and the rubric was reworded after its first run failed (disclosed in `eval-results.md`), so 1/1 is weaker than a pre-fixed rubric. The same paragraphs do say "one run per case measures no spread" and that "Not verified" is not measured.
- **Fix**: Say "checks" instead of "guards" in the three README places; keep the case comment and `eval-results.md` as they are.
- **Decision**: FIXED (Fix now): "guards" became "checks" in the three README places and the case header comment.

## Triage

F1, F2 and F3 fixed on 2026-10-20 in the review-fix commit of phase 2. Free gates after the fixes: 29 tests in `code-reviewer-evals.test.ts`, lint clean, 3 valid eval configs, no "15 cases" in the README grep.
