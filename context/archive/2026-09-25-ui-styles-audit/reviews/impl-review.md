<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Signin: tokeny presetu shadcn i komponenty z `ui/`

- **Plan**: context/changes/ui-styles-audit/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-09-25
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Success Criteria: all automated checks of phases 1–5 pass (lint, build, smoke, greps, 404 under `astro preview`). Manual rows 5.4–5.6 await the human; 5.7 is this review.

Checked and rejected: middleware guard bypass via encoded path (`/%64ashboard` → 302 `/auth/signin`, verified with curl), `?error=__proto__` / `toString` (no message, verified), open redirects (all targets hard-coded), user enumeration through `email_not_confirmed`.

## Findings

### F1 — Kitchen sink builds element ids containing spaces

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/dev/SignInStates.tsx:50,59
- **Detail**: `id={`${title}-email`}` gives ids such as "Field error-email"; `FormField` derives `aria-describedby="Field error-email-error"` (verified in rendered HTML). `aria-describedby` is a space-separated token list, so the error text is not linked to the input in exactly the state the visual gate is meant to prove. Production forms use `email`/`password` and are unaffected.
- **Fix**: Slugify the title in `StateCell` (`title.toLowerCase().replace(/\s+/g, "-")`) before building ids.
- **Decision**: FIXED — slugified ids in `StateCell`; rendered `aria-describedby="field-error-email-error"`

### F2 — Signup still reflects arbitrary `?error=` text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/signup.astro:8, src/pages/api/auth/signup.ts:12,16
- **Detail**: Signin now maps `?error=` to fixed messages, but `/auth/signup?error=<free text>` still renders as a trusted destructive Alert (content spoofing; React escapes it, so no XSS). The plan lists this as deliberately deferred ("Nie mapujemy `?error=` na stronie `signup`"), so the code follows the plan; the finding is that the defect class the change fixes for signin remains one link away.
- **Fix A ⭐ Recommended**: Keep deferred, record it as a follow-up item (`follow-ups/review-fixes.md`) and address it in the next change that touches signup
  - Strength: Respects the agreed scope; the plan explicitly excludes signup and `api/auth/signup.ts`.
  - Tradeoff: The spoofable page stays live until that follow-up lands.
  - Confidence: HIGH — the exclusion is written in "What We're NOT Doing".
  - Blind spot: No owner or date for the follow-up.
- **Fix B**: Add a signup code→message mapping now (extend `auth-errors.ts`, change `api/auth/signup.ts` to emit codes)
  - Strength: Closes the spoofing path completely and reuses `ServerError`.
  - Tradeoff: Expands scope beyond the plan and needs signup smoke assertions; Supabase signup error codes have not been researched.
  - Confidence: MEDIUM — mapping shape is clear, error code set for signup is not.
  - Blind spot: Behaviour of signup for already-registered emails.
- **Decision**: DEFERRED — Fix A; queued in `follow-ups/review-fixes.md`

### F3 — Signin endpoint has no failure handling for malformed requests

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:5-7,13
- **Detail**: `await context.request.formData()` throws on a non-form body, and `form.get(...) as string` is a bare cast (missing fields are `null`, files are not strings); a thrown Supabase/network error also becomes an unhandled 500 instead of `?error=unknown`. Pre-existing pattern (same in signup.ts), but the change now promises a fixed set of outcomes for this endpoint. The plan says "Nie dodajemy walidacji serwerowej pól", so field validation is out of scope; a try/catch that maps failures to `?error=unknown` is not field validation.
- **Fix A ⭐ Recommended**: Wrap the handler body in try/catch and redirect to `/auth/signin?error=unknown`
  - Strength: Every failure ends on the signin page with the fixed "unknown" message; no plan constraint is broken.
  - Tradeoff: Swallows the original error unless it is logged (`console.error`).
  - Confidence: HIGH — `unknown` already exists in `SignInErrorCode` and the message map.
  - Blind spot: How Cloudflare Workers surfaces a thrown `formData()` today (not reproduced).
- **Fix B**: Leave as is and record as a follow-up together with F2
  - Strength: Zero scope change.
  - Tradeoff: A crafted POST still yields a 500 page.
  - Confidence: MEDIUM — low real-user impact, since the form always posts fields.
  - Blind spot: Not measured whether 500s are reported anywhere.
- **Decision**: FIXED — Fix A; try/catch in `signin.ts` redirects to `?error=unknown` (verified with a JSON and a field-less POST), error logged server-side

### F4 — Pending state can stay stuck when the POST never navigates

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useFormSubmitting.ts:1-14
- **Detail**: `submitting` is reset only on bfcache `pageshow` with `persisted`. If the request is aborted (offline, Esc/Stop) the button stays disabled with a spinner until reload. Double submit is prevented as intended.
- **Fix**: Also reset on `pagehide` is not enough; add a timeout reset (e.g. 10 s) or accept the behaviour and document it.
- **Decision**: FIXED — 15 s timeout reset in `useFormSubmitting`

### F5 — Dev-only kitchen sink chunk is emitted to `dist/client`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dev/signin-kitchen-sink.astro:1-16
- **Detail**: The route answers 404 in a production build (verified with `astro preview`, and the markup is eliminated), but `dist/client/_astro/SignInStates.BSm-QTLO.js` is still emitted because of the static import. It is unreferenced and harmless, only the plan's "404 in production" contract is met by the response, not by the absence of the asset.
- **Fix**: Accept and note it in the page comment, or load the component with a dynamic import inside the `isDev` branch.
- **Decision**: FIXED (documented) — dynamic import removed the chunk but broke client hydration in dev (no `astro-island`), so reverted; the page comment now states the chunk is emitted but unreferenced

### F6 — `asChild` and the `shadcn` runtime dependency are unused surface

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/button.tsx:44-50, package.json:34
- **Detail**: Nothing in `src` uses `asChild` (links use `buttonVariants`); it is generated shadcn code, kept for API parity as the plan requires. `shadcn` sits in `dependencies` although it is needed at build time (`@import "shadcn/tailwind.css"`), which adds about 5000 lock lines to runtime deps.
- **Fix**: Move `shadcn` to `devDependencies` if the Cloudflare build installs dev deps; leave `asChild` as generated.
- **Decision**: DISMISSED — build-time packages (`astro`, `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`) already live in `dependencies`, so `shadcn` follows the repo convention; unused `asChild` stays as generated

### F7 — Plan prescribed `Button asChild` for Astro links, which cannot work

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/ui-styles-audit/plan.md (Phase 3, §1)
- **Detail**: Astro passes children of a React component as static HTML, so `asChild` cannot wrap an `.astro` link; the implementation uses `<a class:list={buttonVariants(...)}>`. Intent (link-variant button, token focus ring) is preserved.
- **Fix**: Add a one-line addendum to plan.md so the source of truth matches the code.
- **Decision**: FIXED — addendum added to `plan.md` ("Addendum (po fazie 5)")

### F8 — Error text and hint are not announced or linked on validation failure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/FormField.tsx:59-64, src/components/auth/SignUpForm.tsx
- **Detail**: The error `<p>` is linked via `aria-describedby` but has no live-region role, and focus does not move to the first invalid field after a failed submit; the signup password hint is not linked to the input. Plan required `aria-invalid`/`aria-describedby` only, so this exceeds the agreed scope.
- **Fix**: Consider focusing the first invalid field in `validate()` and linking the hint id in a follow-up; not required by the plan.
  - Strength: Screen-reader users get feedback at the moment of failure.
  - Tradeoff: Touches both forms and needs refs in `FormField`.
  - Confidence: MEDIUM — standard pattern, but not exercised in this repo.
  - Blind spot: Behaviour with the native `noValidate` form and `useId`.
- **Decision**: FIXED — `role="alert"` on field errors, hint linked via `<id>-hint`, first invalid field focused in both forms (verified in headless Chrome on signin and signup)
