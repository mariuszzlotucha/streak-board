# Public Surface Hardening — Plan Brief

> Full plan: `context/changes/public-surface-hardening/plan.md`
> Frame brief: `context/changes/public-surface-hardening/frame.md`
> Research: `context/changes/public-surface-hardening/research.md`

## What & Why

> **Rzeczywisty problem, wokół którego należy planować, to**: aplikacja nie wysyła nagłówków bezpieczeństwa, a domena nie ma polityki poczty. Polityka poczty musi uwzględniać, że poczta wychodzi z `mail.streakboard.app`.

Bodźcem były skany botów (`/wp-admin/install.php`) w logach Cloudflare. Same skany są niegroźne, bo trafiają w 404, ale przegląd produkcji pokazał brakujące podstawy.

## Starting Point

Produkcja nie wysyła żadnego z nagłówków: HSTS, CSP, `X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy. `security.txt` zwraca 404, a domena nie ma SPF ani DMARC. Poczta auth (Resend z `mail.streakboard.app`) ma już własne SPF i DKIM. Astro 7.3.2 umie liczyć hashe CSP, ale nie ma trybu Report-Only.

## Desired End State

Każda strona, odpowiedź API i plik statyczny niesie stałe nagłówki bezpieczeństwa. Strony niosą CSP w trybie Report-Only, a naruszenia widać w logach jako `csp.violation`. `/.well-known/security.txt` podaje kontakt z `CONTACT_EMAIL`. W Cloudflare są HSTS, SPF `-all`, DMARC (najpierw `none`, potem `reject`) i reguła WAF na skany.

## Key Decisions Made

| Decision          | Choice                                                                                      | Why (1 sentence)                                                    | Source   |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| Zakres            | Nagłówki, CSP, `security.txt`, HSTS, SPF/DMARC, WAF                                         | Wszystkie luki są potwierdzone na produkcji                         | Frame    |
| DMARC             | Najpierw `p=none` z `rua`, `p=reject` po sprawdzeniu DKIM                                   | Rekord DMARC korzenia obejmuje też maile Resend z subdomeny         | Frame    |
| Wdrożenie CSP     | Najpierw Report-Only z raportami do `/api/csp-report`, wymuszenie w osobnej zmianie         | Naruszenie na produkcji widać w logach, a nie u użytkownika         | Plan     |
| Źródło CSP        | Astro `security.csp` plus `Astro.csp.insertDirective` w `Layout.astro` dla originu Supabase | Astro sam liczy hashe wysp przy każdym buildzie                     | Research |
| `form-action`     | `'self'`, origin Supabase i `https://accounts.google.com`                                   | Logowanie Google przekierowuje przez oba                            | Research |
| Miejsce nagłówków | Middleware (helper w `src/lib/`) i `public/_headers` dla plików statycznych                 | Gotowy harness testowy; fallback 500 i trailing-slash poza zakresem | Plan     |
| Raporty CSP       | `reportInfo`, tylko dyrektywa, origin i ścieżka, bez Sentry                                 | Bez nowej kategorii danych i bez zmiany polityki prywatności        | Plan     |
| `security.txt`    | Trasa SSR z `contactEmail()`, `Expires` = data buildu + 1 rok, 404 bez adresu               | Adres jest celowo poza repo; plik wygasa, gdy brak wydań            | Plan     |
| `robots.txt`      | Zostaje zarządzany przez Cloudflare                                                         | Content signals już działają                                        | Plan     |

## Scope

**In scope:**

- Stałe nagłówki (Worker i `_headers`), CSP Report-Only, endpoint raportów, `security.txt`, testy, README i CLAUDE.md
- Ręczne kroki operatora: HSTS, SPF, DMARC etapami, WAF

**Out of scope:**

- Wymuszenie CSP (osobna zmiana po obserwacji)
- Własny `robots.txt`
- Nagłówki na fallbacku 500 i trailing-slash
- HSTS preload
- Zmiany polityki prywatności

## Architecture / Approach

Helper `src/lib/security-headers.ts` trzyma wartości nagłówków. Middleware nakłada je na każdy wynik `handle()`, a `public/_headers` powtarza je dla plików statycznych; test pilnuje zgodności. Astro liczy CSP z hashami. `Layout.astro` w czasie renderowania dokłada origin Supabase do `form-action`, a middleware po renderowaniu przemianowuje nagłówek na `-Report-Only`. Przeglądarka wysyła naruszenia do `/api/csp-report`, który loguje znormalizowane pola.

## Phases at a Glance

| Phase                                       | What it delivers                                       | Key risk                                                                       |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1. Nagłówki bezpieczeństwa i `security.txt` | Cztery stałe nagłówki wszędzie, `security.txt` z env   | Duplikaty nagłówków, jeśli Cloudflare stosuje `_headers` także do Workera      |
| 2. CSP Report-Only, dokumentacja i operator | Polityka CSP z raportami, README, HSTS, SPF/DMARC, WAF | `form-action` lub hash niedopasowany do produkcji (tylko raporty, bez blokady) |

**Prerequisites:** lokalny stos Supabase dla `npm test`; konto e2e w `.env` istniejące w lokalnej bazie; dostęp operatora do panelu Cloudflare.
**Estimated effort:** ~1–2 sesje implementacji plus kroki operatora rozłożone na tydzień (DMARC i obserwacja CSP).

## Open Risks & Assumptions

- Zakładamy, że Cloudflare nie dokłada `_headers` do odpowiedzi Workera. Sprawdza to ręczny wiersz 1.5.
- `insertDirective` działa tylko w czasie renderowania, dlatego wywołuje je `Layout.astro`, a nie middleware (plan review F1). Strona, która nie renderuje `Layout`, dostanie `form-action` bez Supabase.
- Zakładamy, że DKIM Resend jest wyrównany z domeną. Do tego czasu DMARC zostaje na `p=none`.

## Success Criteria (Summary)

- `curl -sI` na produkcji pokazuje nagłówki bezpieczeństwa, HSTS i CSP Report-Only, a `security.txt` podaje kontakt.
- Logowanie Google i e-mailem oraz przypomnienia działają bez zmian, a konsola nie pokazuje naruszeń.
- `dig` pokazuje SPF i DMARC, a skany `/wp-*` dostają 403 od WAF.
