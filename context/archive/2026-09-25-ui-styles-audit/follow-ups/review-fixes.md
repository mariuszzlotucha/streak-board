# Review follow-ups: ui-styles-audit

Queued from `reviews/impl-review.md` (2026-09-25). Not part of this change's scope.

- **F2 — Signup reflects raw `?error=` text**: map signup errors to fixed codes (extend `src/lib/auth-errors.ts`, emit codes from `src/pages/api/auth/signup.ts`, resolve in `src/pages/auth/signup.astro`) and add signup smoke assertions. Research the Supabase signup error codes first (e.g. already-registered email). Location: `src/pages/auth/signup.astro:8`, `src/pages/api/auth/signup.ts:12,16`.
