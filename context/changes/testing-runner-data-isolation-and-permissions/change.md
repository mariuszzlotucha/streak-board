---
change_id: testing-runner-data-isolation-and-permissions
title: Test rollout Phase 1 — runner, data isolation and permissions
status: impl_reviewed
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Runner + data isolation and permissions".

### Phase 1 note: auth rate-limit headroom

Local `[auth.rate_limit] sign_in_sign_ups = 30` per 5 minutes per IP (`supabase/config.toml:190`). Each test file signs in once per user it creates: the foundation file uses 1 sign-in per run. Phases 2-3 add about 4-5 users per file, so a full run stays around 10 sign-ins; watch-mode reruns are the only realistic way to hit the limit.
