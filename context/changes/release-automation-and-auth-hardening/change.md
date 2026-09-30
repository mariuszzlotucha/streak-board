---
change_id: release-automation-and-auth-hardening
title: Release automation and auth hardening
status: impl_reviewed
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

- Sender domain for auth e-mail: `streakboard.app` (Cloudflare Registrar, DNS in Cloudflare), registered 2026-09-30. Resend sends from the subdomain `mail.streakboard.app`; the app stays on `workers.dev`. Not a secret.
