---
change_id: public-surface-hardening
title: Public surface hardening
status: archived
created: 2026-10-17
updated: 2026-10-17
archived_at: 2026-10-17T19:04:18Z
---

## Notes

Roadmap S-18 (M-3, MS-04). Code: security headers in middleware (nosniff, Referrer-Policy, X-Frame-Options/frame-ancestors, Permissions-Policy), CSP as Report-Only first, `/.well-known/security.txt`, optional own `public/robots.txt` replacing the Cloudflare-managed one. Operator (manual, Cloudflare panel): HSTS, SPF `v=spf1 -all` and DMARC `p=reject` (if the domain sends no mail), WAF rule blocking `/wp-*` and `*.php` probes. Motivation (2026-10-17): production sends no security headers, no SPF/DMARC, security.txt 404, bots probe `/wp-admin/install.php`.

### Before enforcing CSP (follow-up change)

From the PR #177 review (2026-10-17), to check in the change that flips `CSP_MODE` to `"enforce"`:

- `connect-src 'self'` has no Supabase origin. The browser makes no Supabase calls today (no `createBrowserClient`; the only client `fetch` goes to `/api/reminders/*`, `src/lib/pwa/push.ts:62`); confirm with a week of `csp.violation` logs before enforcing.
- Add `report-to` (with a `Reporting-Endpoints` header) next to `report-uri`. Keep `report-uri`, since Firefox does not support `report-to`. `/api/csp-report` already accepts `application/reports+json`.

### Manual verification after release (2026-10-17)

- Checked on production: 1.5 (each of the four headers once on `/`, `/auth/signin`, `/favicon.svg`), 1.6 (`security.txt` with the production contact), 2.6 (owner: console empty for "Content Security Policy" across landing, e-mail and Google sign-in, dashboard, settings), 2.8 (`strict-transport-security: max-age=15552000; includeSubDomains`), 2.9 (`v=spf1 -all`), 2.12 (`/wp-admin/install.php` and `*.php` answer 403).
- Skipped by owner decision: 2.10 and 2.11 (DKIM check and DMARC). SPF alone is set; DMARC can be added later without code.
- Still open when archived: 2.7 (reminders toggle and service worker on a phone) and 2.13 (a week of `csp.violation` logs before enforcing CSP; see "Before enforcing CSP").
