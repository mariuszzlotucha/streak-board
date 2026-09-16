---
starter_id: 10x-astro-starter
package_manager: npm
project_name: streak-board
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

StreakBoard is a small-scale, solo/after-hours web-app MVP due in 3 weeks with a hard auth requirement (FR-001, email/OAuth/passwordless login) and a group-visibility model that needs a real database from day one. 10x-astro-starter is the recommended default for `(web, js)`: Astro + React + TypeScript on top of Supabase gives auth, PostgreSQL, and row-level access control out of the box, and Cloudflare edge deploy keeps the "check off a task → see it on the leaderboard instantly" interaction snappy without extra infrastructure. Streak decay is treated as computed-on-read business logic (derived from each task's last-completed timestamp) rather than a scheduled job, so the starter's edge-runtime limits on long-running background tasks are not a blocker for MVP; background jobs and payments/realtime/AI stay out of scope per the PRD's non-goals. Deployment defaults to Cloudflare Pages (the starter's own default, left unspecified by the user); CI runs on GitHub Actions with auto-deploy-on-merge, the standard shape for a solo project this size. Bootstrapper confidence is first-class — registered with a valid CLI, not yet battle-tested, so expect mostly-smooth scaffolding with occasional manual steps.
