<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Landing page

- **Plan**: context/changes/landing-page/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-10-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Plan adherence: all 11 Changes Required items MATCH (commit `903a89b`); the only files outside the plan's list are the change's bookkeeping (`plan.md` Progress, `change.md` status, the S-09 roadmap status). Accepted deviations, all owner-visible during the phase: sign-up notice and policy sentences reworded so no punctuation follows a link (formatter); deletion bullet "the data kept until deletion" instead of "everything above"; "days or weeks you marked done"; landing copy "halved (rounded down), not reset" (owner decision); `SiteFooter` `class` prop; smoke `secureCookies` expectation field; CI `/` body matched with `case`; README avoids the literal banner file name; extra user-id step in the deletion procedure.

Success criteria re-run on `903a89b`: lint, `astro check`, build, `npm test` (385/385), smoke against the production preview, Playwright (3/3) and the leftover `rg` all pass. 1.8 (CI on the PR) is pending until the branch is pushed after this review. Manual 1.9 to 1.12: browser run on the preview (desktop and 375 px, signed-in flow, `Secure` on `sb-` cookies) and the owner's acceptance of the policy, both in the implementation session.

## Triage

Fixed: F1, F2 (Fix A), F3, F5, F6. Accepted: F4. Fixes re-verified: lint, `astro check`, build, `npm test` (385/385), smoke and the release live check against the production preview, Playwright (3/3), leftover `rg`.

## Findings

### F1 — Verifier cookie's Secure flag is not asserted

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:437-447
- **Detail**: The `Secure` assertion runs only on `signin accepts correct password` (`:629`, the `sb-…-auth-token` cookie). The Google start step sets `sb-…-code-verifier` but checks only its presence, while the plan's intent and `CLAUDE.md` say every Supabase cookie carries `Secure` in production. Today the library builds both from the same options, so it holds; nothing pins it.
- **Fix**: Add `...(PRODUCTION_BUILD ? { secureCookies: "sb-" } : {})` to the "google start redirects to the Supabase authorize URL…" step.
- **Decision**: FIXED — the Google start smoke step asserts `Secure` on every `sb-` cookie in a production build; break-check: smoke went red with `secure: false`.

### F2 — Cloudflare e-mail obfuscation would only be caught by hand

- **Severity**: OBSERVATION
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/site/SiteFooter.astro:20, src/pages/privacy.astro:38
- **Detail**: If Scrape Shield's Email Address Obfuscation applies to the zone, production rewrites the `mailto:` links to `/cdn-cgi/l/email-protection`, so the controller's contact becomes JavaScript-only on the page Google reviews. Local smoke cannot see it, and the release check looks only for `href="/privacy"`. Plan Phase 2 step 3 already has Claude check this with `curl` after the release.
- **Fix A ⭐ Recommended**: Extend the release live check to also require `href="mailto:` in the `/privacy` body, inside the same retry loop.
  - Strength: Every future release fails closed if the contact link is rewritten, not only this one.
  - Tradeoff: One more body fetch in the loop; a zone setting, not the code, can now fail a release.
  - Confidence: HIGH — the loop already fetches `/` the same way.
  - Blind spot: Whether obfuscation is on for the zone today is unknown.
- **Fix B**: Rely on the Phase 2 `curl` check already in the plan.
  - Strength: No change to CI; the plan covers this release.
  - Tradeoff: A later zone setting change would go unnoticed.
  - Confidence: MED — depends on someone repeating the manual check.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — the release live check also requires `href="mailto:` in the `/privacy` body, in the same retry loop; README release step and CI bullet updated; break-check: the check failed with the contact link rewritten to `/cdn-cgi/l/email-protection`.

### F3 — Smoke-pinned sign-up phrase is plain markup text

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/signup.astro:33
- **Detail**: Smoke matches "will see your e-mail address" in the raw HTML. A Prettier reflow that breaks the line inside the phrase would fail smoke for no real reason; `privacy.astro` keeps its pinned name in a constant (`SUPERVISORY_AUTHORITY`) for exactly this.
- **Fix**: Move the sentence into a frontmatter constant and render it with `{…}`.
- **Decision**: FIXED — the sentence is the frontmatter constant `EMAIL_VISIBILITY`.

### F4 — Inline link class written twice

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/signup.astro:15, src/pages/privacy.astro:14
- **Detail**: `"font-medium text-primary underline-offset-4 hover:underline"` is repeated. Not using `buttonVariants({ variant: "link" })` is right (it adds button sizing), but two copies can drift.
- **Fix**: Leave as is; extract a shared constant when a third use appears.
- **Decision**: ACCEPTED — left as is; extract a shared constant at a third use.

### F5 — `<h3>` wrapped in `CardTitle` on the landing cards

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/index.astro:82-84
- **Detail**: `CardTitle` renders a `<div>` with its own heading classes, which the inner `<h3>` overrides; the auth pages put their heading straight in `CardHeader`. The output is valid (correct h1 → h2 → h3 order).
- **Fix**: Drop the `CardTitle` wrapper and keep the `<h3>` in `CardHeader`.
- **Decision**: FIXED — `CardTitle` wrapper removed; the `<h3>` sits in `CardHeader`.

### F6 — PNG favicon link may win over the SVG

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/layouts/Layout.astro:21-22
- **Detail**: The PNG `<link rel="icon">` comes last and has no `sizes`, so Chromium may pick the 48 px PNG over the scalable SVG. Both are the new mark; only sharpness differs.
- **Fix**: Add `sizes="48x48"` to the PNG link (and `sizes="any"` to the SVG link) so browsers prefer the SVG.
- **Decision**: FIXED — `sizes="any"` on the SVG link, `sizes="48x48"` on the PNG link.
