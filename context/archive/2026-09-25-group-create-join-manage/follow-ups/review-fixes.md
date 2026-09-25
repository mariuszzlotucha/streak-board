# Review follow-ups

Queued from `reviews/impl-review-phase-1.md` and `reviews/impl-review-phase-3.md`.

## For Phase 2 (from F2)

- `src/types.ts` types `preview_group` as `Returns: string` and `list_group_members` rows with `email: string`, but both can be NULL (unknown/deleted code; users without an email).
- In Phase 2, wrap the two RPCs in typed helpers in `src/lib/groups.ts` (e.g. `previewGroup(supabase, code): Promise<string | null>` and a member type with `email: string | null`) and use them from `dashboard.astro`, instead of calling `rpc()` directly. Do not hand-edit `src/types.ts`.
- Add this helper to the Phase 2 file list when implementing (it is not in the plan's `groups.ts` contract).

## Before pushing the migration to production (from F3)

- `preview_group` is a side-effect-free, un-rate-limited validity oracle. Groups created before hardening have 8-hex join codes (32 bits) and would become enumerable without joining.
- Before applying `20260925161234_add_group_member_list_and_preview.sql` to the production Supabase project, run `select length(join_code), count(*) from public.groups group by 1;` and record the result in the deployment step (`context/changes/deployment/deployment-plan.md`). If 8-character codes exist, decide whether to rotate them or accept the risk.

## For Phase 4 (from the Phase 3 review, F5)

- `CLAUDE.md:9,11` and `AGENTS.md:9,11` still say `PROTECTED_ROUTES` is currently `["/dashboard"]` and list only `src/pages/api/auth/{signin,signup,signout}.ts` as API endpoints. `src/middleware.ts:4` now protects `["/dashboard", "/api/groups"]`, and the app has `src/pages/api/groups/{create,join,rename,leave}.ts` (Phase 4 adds `remove-member` and `delete`) plus the invite route `src/pages/join/[code].ts`.
- Phase 4's docs step in the plan covers only `README.md`. When implementing it, also make one-line edits to `CLAUDE.md` and `AGENTS.md` (they are mirrored copies): the current `PROTECTED_ROUTES` value and the new endpoint and page paths. Add both files to the phase's file list and stage only those lines.
