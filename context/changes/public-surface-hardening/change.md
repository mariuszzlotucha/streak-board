---
change_id: public-surface-hardening
title: Public surface hardening
status: impl_reviewed
created: 2026-10-17
updated: 2026-10-17
archived_at: null
---

## Notes

Roadmap S-18 (M-3, MS-04). Code: security headers in middleware (nosniff, Referrer-Policy, X-Frame-Options/frame-ancestors, Permissions-Policy), CSP as Report-Only first, `/.well-known/security.txt`, optional own `public/robots.txt` replacing the Cloudflare-managed one. Operator (manual, Cloudflare panel): HSTS, SPF `v=spf1 -all` and DMARC `p=reject` (if the domain sends no mail), WAF rule blocking `/wp-*` and `*.php` probes. Motivation (2026-10-17): production sends no security headers, no SPF/DMARC, security.txt 404, bots probe `/wp-admin/install.php`.

### Before enforcing CSP (follow-up change)

From the PR #177 review (2026-10-17), to check in the change that flips `CSP_MODE` to `"enforce"`:

- `connect-src 'self'` has no Supabase origin. The browser makes no Supabase calls today (no `createBrowserClient`; the only client `fetch` goes to `/api/reminders/*`, `src/lib/pwa/push.ts:62`); confirm with a week of `csp.violation` logs before enforcing.
- Add `report-to` (with a `Reporting-Endpoints` header) next to `report-uri`. Keep `report-uri`, since Firefox does not support `report-to`. `/api/csp-report` already accepts `application/reports+json`.
