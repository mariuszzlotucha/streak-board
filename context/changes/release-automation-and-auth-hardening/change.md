---
change_id: release-automation-and-auth-hardening
title: Release automation and auth hardening
status: impl_reviewed
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

- Sender domain for auth e-mail: `streakboard.app` (Cloudflare Registrar, DNS in Cloudflare), registered 2026-09-30. Resend sends from the subdomain `mail.streakboard.app`; the app stays on `workers.dev` for now; moving the app itself to `streakboard.app` is a separate, later change (custom domain, `PRODUCTION_URL`, Supabase Site URL and Redirect URLs). Not a secret.
