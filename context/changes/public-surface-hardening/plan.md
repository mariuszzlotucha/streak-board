# Public Surface Hardening Implementation Plan

## Overview

Produkcja (`https://streakboard.app`, sprawdzona 2026-10-17) nie wysyła żadnego nagłówka bezpieczeństwa, `/.well-known/security.txt` zwraca 404, a domena nie ma SPF ani DMARC. Ten plan dodaje stałe nagłówki bezpieczeństwa (Worker i pliki statyczne), CSP w trybie Report-Only ze zbieraniem raportów, `security.txt` z adresu w env oraz ręczne kroki operatora w Cloudflare i DNS. Wymuszenie CSP to osobna, mała zmiana po okresie obserwacji raportów.

## Current State Analysis

- `src/middleware.ts:46-73`: wszystkie wyjścia `handle()` (503, `context.redirect`, `next()`) dają odpowiedzi z modyfikowalnymi nagłówkami. 404 jest SSR (`src/pages/404.astro:6`) i przechodzi przez middleware (research.md, „Pokrycie odpowiedzi”).
- Pliki statyczne Cloudflare podaje bez Workera (`wrangler.jsonc`: `assets.directory: ./dist`, brak `run_worker_first`). `public/_headers` ma reguły tylko dla `/sw.js` i `/manifest.webmanifest`. Adapter dopisuje `Cache-Control` dla `/_astro/*`, chyba że istniejąca pasująca reguła już ustawia `Cache-Control` (`node_modules/@astrojs/cloudflare/dist/index.js:486`).
- Astro 7.3.2 `security.csp` dla stron SSR ustawia nagłówek `content-security-policy` (`node_modules/astro/dist/runtime/server/render/page.js:29-30`). Automatycznie hashuje runtime wysp, skrypty dyrektyw i styl wysp (`core/csp/common.js:83-113`). Nie hashuje `<script is:inline>` (`src/components/site/ClearErrorParam.astro:7`) i nie ma trybu Report-Only. Runtime API `Astro.csp.insertDirective` (`types/public/context.d.ts:480-564`) działa tylko w czasie renderowania strony: zmienia politykę wyłącznie, gdy istnieje `state.result` (`core/fetch/fetch-state.js:511`), a ten powstaje w handlerze strony wewnątrz `next()` (`core/pages/handler.js:30`). Wywołanie w middleware przed `next()` jest cichym no-opem (plan review F1). Scala źródła w istniejącą dyrektywę (`core/csp/runtime.js:29-60`).
- Logowanie Google to łańcuch `POST /api/auth/google` → 302 `https://<ref>.supabase.co/auth/v1/authorize` → 302 `https://accounts.google.com/...` (zmierzone na produkcji). Chromium stosuje `form-action` do celów przekierowania (test Report-Only w `frame.md`).
- `CONTACT_EMAIL` to opcjonalny sekret serwera czytany przez `contactEmail()` (`src/lib/site.ts:1-10`), celowo poza repo i bundlem (README.md:285-293).
- Poczta auth wychodzi przez Resend z `mail.streakboard.app` (README.md:355), z własnym SPF (`send.mail.streakboard.app`) i DKIM (`resend._domainkey.mail.streakboard.app`). Korzeń domeny nie wysyła poczty.
- Wzorzec publicznego endpointu raportów: `src/pages/api/client-errors.ts` (limit rozmiaru, `no-store`, `readAtMost`, tylko znane wartości, `reportError`).

## Desired End State

- Każda odpowiedź Workera z `handle()` oraz każdy plik statyczny niesie `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` i `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- Strony SSR niosą `Content-Security-Policy-Report-Only` z hashami Astro, `form-action` obejmującym origin Supabase i `https://accounts.google.com` oraz `report-uri /api/csp-report`. Naruszenia trafiają do logów jako `csp.violation`. Na stronach aplikacji nie ma wymuszonego nagłówka `Content-Security-Policy`.
- `GET /.well-known/security.txt` zwraca plik zgodny z RFC 9116 z adresem z `CONTACT_EMAIL`, a bez adresu zwraca 404.
- Operator ustawił HSTS, SPF `-all` na korzeniu, DMARC (najpierw `p=none` z `rua`, `p=reject` po potwierdzeniu DKIM Resend) i regułę WAF na skany `/wp-*` i `*.php`.
- Weryfikacja: `curl -sI https://streakboard.app/`, `/favicon.svg` i `/.well-known/security.txt` na produkcji oraz `dig TXT` dla `streakboard.app` i `_dmarc.streakboard.app`.

### Key Discoveries:

- `frame-ancestors` jest ignorowane w trybie Report-Only, więc ochronę przed osadzaniem w ramkach od razu daje `X-Frame-Options: DENY` z fazy 1.
- Origin Supabase pochodzi z `SUPABASE_URL` (`astro:env/server`, runtime). Nie da się go wpisać w `astro.config.mjs`, więc dokłada go `src/layouts/Layout.astro` przez `Astro.csp.insertDirective` w czasie renderowania (każda strona renderuje `Layout` przez `PublicLayout` albo `AppLayout`).
- Raporty CSP przychodzą jako `application/csp-report` (JSON). Astro sprawdza origin tylko dla typów formularzy, więc endpoint musi sam ograniczać rozmiar i zapisywać wyłącznie znormalizowane pola.
- Polityka prywatności opisuje własne wpisy logów („route, user id, request id, time”, `src/components/privacy/WhatWeCollect.astro:35`). Raport zapisany przez `reportInfo` z dyrektywą, originem zablokowanego zasobu i ścieżką bez query nie wprowadza nowej kategorii danych ani dostawcy i nie trafia do Sentry.

## What We're NOT Doing

- Wymuszanie CSP. Przełączenie z Report-Only na wymuszenie to osobna, mała zmiana po obserwacji raportów (ręczny wiersz 2.x).
- Własny `public/robots.txt`. Zarządzany przez Cloudflare `robots.txt` z content signals zostaje.
- Nagłówki na fallbacku 500 Astro i na przekierowaniach trailing-slash. Powstają poza middleware, są puste i niskiego ryzyka (research.md, „Poza pokryciem”). Opakowania `fetch` w `src/worker.ts` nie dodajemy.
- HSTS w kodzie. Ustawia go operator w Cloudflare (Edge Certificates), bez preload.
- Zmiany w polityce prywatności. Sprawdzone: brak nowego dostawcy, cookie ani kategorii danych.
- Wysyłanie raportów CSP do Sentry albo zewnętrznego dostawcy.

## Implementation Approach

Faza 1 dodaje nagłówki niezależne od treści w jednym helperze, używanym przez middleware. Te same wartości trafiają do reguły `/*` w `public/_headers`, a test pilnuje, żeby oba źródła się nie rozjechały. W tej samej fazie powstaje `security.txt`, bo to również prosta trasa o niskim ryzyku.

Faza 2 zostawia liczenie hashy Astro (`security.csp`). Middleware dokłada origin Supabase do `form-action` i przemianowuje nagłówek CSP na wariant `-Report-Only`. Raporty przyjmuje endpoint zbudowany na wzorcu `client-errors.ts`. Kroki operatora i dokumentacja zamykają fazę.

## Critical Implementation Details

- **Kolejność w middleware.** Przemianowanie CSP i nagłówki stałe stosuje się do odpowiedzi zwróconej przez `next()`, czyli po wyrenderowaniu strony, kiedy Astro już ustawił `content-security-policy`. Middleware nie dotyka `context.csp`: dyrektywę Supabase dodaje `Layout.astro` w czasie renderowania. Odpowiedź z nagłówkami tylko do odczytu (np. `Response.redirect`) trzeba najpierw skopiować przez `new Response(res.body, res)`.
- **`context.csp` poza renderowaniem.** `context.csp` jest `undefined` bez `security.csp` (`core/fetch/fetch-state.js:476-483`), a fałszywy kontekst w `tests/integration/middleware.test.ts:34-44` go nie ma. Middleware nie używa `context.csp` w żadnej fazie; jedyny krok CSP w middleware to `toReportOnly` na gotowej odpowiedzi (plan review F3). W `Layout.astro` wywołanie jest warunkowe: tylko gdy `SUPABASE_URL` jest ustawione i `Astro.csp` istnieje. Trasy API nie dostają CSP od Astro (nagłówek ustawia tylko `runtime/server/render/page.js:29`).
- **CSP nie działa w `astro dev`** (`types/public/config.d.ts:~755`). Weryfikacja nagłówka wymaga `npm run build && npm run preview`, czyli tego samego, co robi e2e.

## Phase 1: Nagłówki bezpieczeństwa i security.txt

### Overview

Stałe nagłówki na każdej odpowiedzi z `handle()` i na plikach statycznych oraz trasa `/.well-known/security.txt`.

### Changes Required:

#### 1. Helper nagłówków

**File**: `src/lib/security-headers.ts` (nowy)

**Intent**: Jedno źródło wartości stałych nagłówków bezpieczeństwa i funkcja nakładająca je na `Response`, używana przez middleware.

**Contract**: eksport `SECURITY_HEADERS` (tablica par nazwa i wartość: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`) oraz `withSecurityHeaders(response: Response): Response`. Funkcja ustawia nagłówki na odpowiedzi albo, gdy jej nagłówki są niemodyfikowalne, na kopii `new Response(response.body, response)`, i nie nadpisuje nagłówka, który odpowiedź już ustawiła.

#### 2. Middleware

**File**: `src/middleware.ts`

**Intent**: Każda odpowiedź zwrócona przez `handle()` (503, przekierowania, `next()`) przechodzi przez `withSecurityHeaders`.

**Contract**: `onRequest` (`src/middleware.ts:83`) albo koniec `handle()` opakowuje wynik. Ścieżka wyjątku (catch z rethrow, `:74-77`) zostaje bez zmian.

#### 3. Pliki statyczne

**File**: `public/_headers`

**Intent**: Reguła `/*` z tymi samymi czterema nagłówkami, bez `Cache-Control`, żeby adapter dalej dopisywał regułę `/_astro/*`.

**Contract**: nowy blok `/*` przed istniejącymi regułami, z komentarzem, że wartości muszą zgadzać się z `SECURITY_HEADERS`.

#### 4. security.txt

**File**: `src/lib/security-txt.ts` (nowy), `src/pages/.well-known/security.txt.ts` (nowy), `astro.config.mjs` (`vite.define`)

**Intent**: Plik RFC 9116 budowany z `contactEmail()`, z `Expires` wyliczonym z daty buildu plus jeden rok, żeby plik wygasł, jeśli przez rok nie było wydania.

**Contract**: `export const prerender = false`, `GET` zwraca `text/plain; charset=utf-8` z liniami `Contact: mailto:<adres>`, `Expires: <ISO 8601>`, `Preferred-Languages: pl, en` i `Canonical: https://streakboard.app/.well-known/security.txt`. Bez `CONTACT_EMAIL` zwraca 404. Treść buduje czysta funkcja `securityTxt(contact: string, builtAt: Date): string` w `src/lib/security-txt.ts` (`Expires` = `builtAt` + 1 rok). Trasa podaje jej stałą buildu `__BUILD_DATE__` z `vite.define` w `astro.config.mjs`, z fallbackiem `typeof __BUILD_DATE__ !== "undefined"`, bo konfiguracje vitest nie dziedziczą `vite.define` z Astro (plan review F2). Data nie pochodzi z zegara żądania.

#### 5. Testy

**File**: `tests/unit/security-headers.test.ts` (nowy), `tests/integration/middleware.test.ts`, `tests/unit/security-txt.test.ts` (nowy)

**Intent**:

- Unit: `withSecurityHeaders` ustawia cztery nagłówki, działa na odpowiedzi z niemodyfikowalnymi nagłówkami (np. `Response.redirect`) i nie nadpisuje istniejącego nagłówka. Wartości reguły `/*` w `public/_headers` są równe `SECURITY_HEADERS`.
- Integration: odpowiedzi middleware 302, 503 i `next()` niosą nagłówki.
- Unit: `securityTxt` dla stałej daty buildu daje dokładne linie i `Expires` równe dacie buildu plus rok; trasa zwraca 404 bez adresu (z mockiem `@/lib/site`).

**Contract**: istniejące asercje `middleware.test.ts:103-104`, `:114` i `:197` zostają.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass (local Supabase stack): `npm test`
- Lint and type check pass: `npm run lint` and `npx astro check`
- Smoke passes: `npm run smoke`

#### Manual Verification:

- After release, `curl -sI https://streakboard.app/`, `/auth/signin` and `/favicon.svg` show the four headers once each (no duplicates from `_headers` on Worker responses)
- After release, `https://streakboard.app/.well-known/security.txt` returns the file with the production contact address

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: CSP Report-Only, dokumentacja i kroki operatora

### Overview

Polityka CSP liczona przez Astro, wysyłana jako `Content-Security-Policy-Report-Only`, z raportami do własnego endpointu. Dokumentacja i ręczne kroki operatora w Cloudflare i DNS.

### Changes Required:

#### 1. Konfiguracja CSP

**File**: `astro.config.mjs`

**Intent**: Włączyć `security.csp` z dyrektywami polityki. Hash `ClearErrorParam` wpisany ręcznie, bo Astro nie hashuje `is:inline`.

**Contract**: `security.csp.directives`:

- `default-src 'self'`
- `img-src 'self' data:`
- `connect-src 'self'`
- `font-src 'self'`
- `manifest-src 'self'`
- `worker-src 'self'`
- `object-src 'none'`
- `base-uri 'self'`
- `frame-ancestors 'none'`
- `form-action 'self' https://accounts.google.com`
- `report-uri /api/csp-report`

`scriptDirective.hashes` zawiera hash skryptu z `ClearErrorParam.astro`.

#### 2. Origin Supabase w Layout i Report-Only w middleware

**File**: `src/layouts/Layout.astro`, `src/middleware.ts`, `src/lib/security-headers.ts`

**Intent**: Dołożyć origin Supabase do `form-action` w czasie renderowania strony (`Layout.astro`) i przemianować nagłówek CSP strony na wariant Report-Only w middleware po renderowaniu.

**Contract**:

- `Layout.astro` (frontmatter): gdy `SUPABASE_URL` jest ustawione i `Astro.csp` istnieje, `Astro.csp.insertDirective("form-action " + new URL(SUPABASE_URL).origin)`. Astro scala to z `form-action` z configu w jedną dyrektywę.
- Middleware nie używa `context.csp`.
- Po `next()`: helper (np. `toReportOnly(response)`) przenosi wartość `content-security-policy` do `content-security-policy-report-only` i usuwa oryginał.
- Przełączenie na wymuszenie w przyszłej zmianie to usunięcie tego kroku. Stała `CSP_MODE = "report-only"` w helperze czyni to jedną linią.

#### 3. Endpoint raportów

**File**: `src/pages/api/csp-report.ts` (nowy)

**Intent**: Przyjmować raporty CSP przeglądarki i zapisywać tylko znormalizowane pola w logach, bez Sentry.

**Contract**:

- `POST`, `prerender = false`, odpowiedzi z `Cache-Control: no-store`.
- Przyjmuje `application/csp-report` i `application/reports+json`; inne typy dostają 415.
- Limit treści 8 KiB jak w `client-errors.ts`: deklarowana długość ponad limit daje 413 przed odczytem, a odczyt kończy się na limicie plus jeden bajt.
- Niepoprawny JSON daje 400. Wynik poprawny to 204.
- Zapis przez `reportInfo("csp.violation", …)` z polami:
  - `directive` (`effective-directive` / `effectiveDirective`),
  - `blocked`: sam origin albo słowo kluczowe `inline`, `eval` lub `data`,
  - `path`: ścieżka dokumentu bez query i hasha.

  Wartości obcina do rozsądnej długości. Pełne URL-e, `script-sample` i nagłówki żądania nie trafiają do logu.

#### 4. Komentarz w ClearErrorParam

**File**: `src/components/site/ClearErrorParam.astro`

**Intent**: Komentarz w linii 5 („strona nie wysyła CSP”) jest nieaktualny. Ma mówić, że hash skryptu stoi w `astro.config.mjs` i zmiana treści wymaga jego aktualizacji.

**Contract**: tylko komentarz. Treść skryptu bez zmian.

#### 5. Testy

**File**: `tests/unit/security-headers.test.ts`, `tests/unit/csp-report.test.ts` (nowy), `tests/unit/csp-hash.test.ts` (nowy), `tests/e2e/`

**Intent**:

- Unit:
  - `toReportOnly` przenosi nagłówek i nie zostawia wymuszonego.
  - Endpoint przyjmuje oba formaty, zwraca 415, 413 i 400 w swoich przypadkach i loguje tylko znormalizowane pola (bez query, bez sample). Przypadek: `blocked-uri` `https://x.test/a?email=a@b.c` loguje samo `https://x.test`, a `document-uri` z query loguje samą ścieżkę (plan review F4).
  - Hash w `astro.config.mjs` jest równy SHA-256 aktualnej treści skryptu w `ClearErrorParam.astro`.
- E2E: na buildzie preview `/auth/signin` ma nagłówek `content-security-policy-report-only` z originem Supabase w `form-action` i nie ma `content-security-policy`. Przejście po stronach (landing, signin, dashboard, settings) nie daje w konsoli komunikatów `[Report Only]`.

**Contract**: test e2e nie klika „Continue with Google”, bo wychodzi do sieci. `form-action` sprawdza przez treść nagłówka.

#### 6. Dokumentacja

**File**: `README.md`, `CLAUDE.md`, `context/foundation/roadmap.md` (tylko status)

**Intent**:

- README: nowa sekcja o nagłówkach bezpieczeństwa: gdzie są ustawiane (middleware i `_headers`), CSP Report-Only i jak przełączyć na wymuszenie, endpoint `/api/csp-report` i zdarzenie `csp.violation`, `security.txt` i `CONTACT_EMAIL`, oraz ręczne ustawienia Cloudflare i DNS (HSTS, SPF, DMARC, WAF).
- CLAUDE.md: jedna linia w Architecture o nagłówkach i nowych trasach.

**Contract**: sekcja README obok „Auth e-mail sender domain” i „Production auth settings”.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test:unit`
- Integration tests pass (local Supabase stack): `npm test`
- E2E passes on the preview build: `npx playwright test`
- Lint, format and type check pass: `npm run lint` and `npx astro check`
- Smoke passes: `npm run smoke`

#### Manual Verification:

- After release, Google sign-in and e-mail sign-in work on production, and the browser console shows no `[Report Only]` messages on landing, sign-in, dashboard and settings
- After release, reminders toggle and service worker registration still work on a phone
- Operator: HSTS enabled in Cloudflare (SSL/TLS → Edge Certificates, max-age 6 months, include subdomains, no preload); `curl -sI https://streakboard.app/` shows `strict-transport-security`
- Operator: DNS TXT `streakboard.app` = `v=spf1 -all`; `dig +short TXT streakboard.app` shows it next to the Google verification record
- Operator: confirm in a received confirmation e-mail ("Show original") `DKIM: PASS with domain mail.streakboard.app`
- Operator: DNS TXT `_dmarc.streakboard.app` = `v=DMARC1; p=none; rua=mailto:<operator address>`; after a week of reports with Resend passing, change to `p=reject`
- Operator: Cloudflare WAF custom rule blocks `starts_with(http.request.uri.path, "/wp-")` or `ends_with(http.request.uri.path, ".php")`; `curl -s -o /dev/null -w "%{http_code}" https://streakboard.app/wp-admin/install.php` returns 403
- After a week in production, Cloudflare logs show no unexpected `csp.violation` events; open the follow-up change that enforces CSP

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `withSecurityHeaders`: cztery nagłówki, odpowiedź z niemodyfikowalnymi nagłówkami, brak nadpisania.
- Zgodność reguły `/*` w `public/_headers` z `SECURITY_HEADERS`.
- `security.txt`: treść z adresem, `Expires` w przyszłości, 404 bez adresu.
- `toReportOnly` i endpoint `csp-report`: formaty, limity, normalizacja (bez query, bez sample).
- Hash `ClearErrorParam` równy treści skryptu.

### Integration Tests:

- `tests/integration/middleware.test.ts`: nagłówki na 302, 503 i `next()`.

### Manual Testing Steps:

1. Po wydaniu: `curl -sI` dla `/`, `/auth/signin`, `/favicon.svg` i `/.well-known/security.txt`.
2. Logowanie Google i e-mailem na produkcji, konsola bez `[Report Only]`.
3. Przełącznik przypomnień i service worker na telefonie.
4. Kroki operatora: HSTS, SPF, DKIM, DMARC, WAF, z poleceniami weryfikacji z kryteriów fazy 2.

## Performance Considerations

Kilka `headers.set` na odpowiedź i jedna dodatkowa kopia `Response` tylko dla odpowiedzi z niemodyfikowalnymi nagłówkami. Endpoint raportów czyta najwyżej 8 KiB. Bez wpływu na limit CPU Workera.

## Migration Notes

Wycofanie: revert commitów fazy. Kroki operatora wycofuje się w panelu Cloudflare. HSTS bez preload można skrócić do `max-age=0`.

## References

- Frame brief: `context/changes/public-surface-hardening/frame.md`
- Research: `context/changes/public-surface-hardening/research.md`
- Wzorzec endpointu: `src/pages/api/client-errors.ts`
- Middleware: `src/middleware.ts:46-83`
- Testy middleware: `tests/integration/middleware.test.ts:34-46`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Nagłówki bezpieczeństwa i security.txt

#### Automated

- [x] 1.1 Unit tests pass: `npm run test:unit`
- [x] 1.2 Integration tests pass (local Supabase stack): `npm test`
- [x] 1.3 Lint and type check pass: `npm run lint` and `npx astro check`
- [x] 1.4 Smoke passes: `npm run smoke`

#### Manual

- [ ] 1.5 After release, `curl -sI https://streakboard.app/`, `/auth/signin` and `/favicon.svg` show the four headers once each (no duplicates from `_headers` on Worker responses)
- [ ] 1.6 After release, `https://streakboard.app/.well-known/security.txt` returns the file with the production contact address

### Phase 2: CSP Report-Only, dokumentacja i kroki operatora

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test:unit`
- [ ] 2.2 Integration tests pass (local Supabase stack): `npm test`
- [ ] 2.3 E2E passes on the preview build: `npx playwright test`
- [ ] 2.4 Lint, format and type check pass: `npm run lint` and `npx astro check`
- [ ] 2.5 Smoke passes: `npm run smoke`

#### Manual

- [ ] 2.6 After release, Google sign-in and e-mail sign-in work on production, and the browser console shows no `[Report Only]` messages on landing, sign-in, dashboard and settings
- [ ] 2.7 After release, reminders toggle and service worker registration still work on a phone
- [ ] 2.8 Operator: HSTS enabled in Cloudflare (SSL/TLS → Edge Certificates, max-age 6 months, include subdomains, no preload); `curl -sI https://streakboard.app/` shows `strict-transport-security`
- [ ] 2.9 Operator: DNS TXT `streakboard.app` = `v=spf1 -all`; `dig +short TXT streakboard.app` shows it next to the Google verification record
- [ ] 2.10 Operator: confirm in a received confirmation e-mail ("Show original") `DKIM: PASS with domain mail.streakboard.app`
- [ ] 2.11 Operator: DNS TXT `_dmarc.streakboard.app` = `v=DMARC1; p=none; rua=mailto:<operator address>`; after a week of reports with Resend passing, change to `p=reject`
- [ ] 2.12 Operator: Cloudflare WAF custom rule blocks `starts_with(http.request.uri.path, "/wp-")` or `ends_with(http.request.uri.path, ".php")`; `curl -s -o /dev/null -w "%{http_code}" https://streakboard.app/wp-admin/install.php` returns 403
- [ ] 2.13 After a week in production, Cloudflare logs show no unexpected `csp.violation` events; open the follow-up change that enforces CSP
