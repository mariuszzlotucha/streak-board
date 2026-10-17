---
date: 2026-10-17T20:15:00+02:00
researcher: Claude (Opus 5.5)
git_commit: 494aba7
branch: master
repository: streak-board
topic: "Gdzie i jak dodać nagłówki bezpieczeństwa, CSP i security.txt w StreakBoard"
tags: [research, security-headers, csp, middleware, cloudflare, security-txt]
status: complete
last_updated: 2026-10-17
last_updated_by: Claude (Opus 5.5)
---

# Research: nagłówki bezpieczeństwa, CSP i security.txt

**Date**: 2026-10-17T20:15:00+02:00
**Git Commit**: 494aba7 (master, niezacommitowane: roadmapa S-18 i ten folder)
**Repository**: streak-board

## Research Question

Na podstawie `frame.md`: które odpowiedzi aplikacji dostaną nagłówki ustawione w jednym miejscu, jak Astro 7.3.2 dostarcza CSP dla stron SSR, czego potrzebuje polityka (logowanie Google, skrypty inline), jak podać `security.txt` bez łamania reguł repo i które testy dotyka zmiana.

## Summary

- **Jedno miejsce na nagłówki to wynik `handle()` w `src/middleware.ts`.** Obejmuje strony SSR, trasy API, 404, odpowiedzi 503 i przekierowania middleware. Nie obejmuje: wyjątków zrzuconych przez middleware (Astro odpowiada wtedy fallbackiem 500), przekierowań trailing-slash Astro oraz plików statycznych. Pliki statyczne podaje Cloudflare bez udziału Workera, więc pokrywa je tylko `public/_headers`.
- **Astro 7.3.2 dla stron SSR wysyła CSP jako nagłówek `content-security-policy`, nie `<meta>`** (`runtime/server/render/page.js:29-30`; cel `header` dla stron bez prerenderu, `core/fetch/fetch-state.js:335`). Automatycznie hashuje runtime wysp, skrypty dyrektyw klienta i styl `astro-island{display:contents}` (`core/csp/common.js:83-84, 93-94, 111-113`). Nie hashuje `<script is:inline>`, a w kodzie CSP nie znaleziono trybu Report-Only. Nie działa w `astro dev`, tylko na buildzie i w preview.
- **`form-action` musi dopuścić dwa originy łańcucha logowania Google**, zmierzone na produkcji 2026-10-17: `POST /api/auth/google` → 302 do `https://wzpgyobsomvjyfrngyuu.supabase.co/auth/v1/authorize` → 302 do `https://accounts.google.com/o/oauth2/v2/auth`.
- **`security.txt` nie może być plikiem statycznym**, bo adres kontaktowy `CONTACT_EMAIL` jest celowo poza repo i bundlem (`src/lib/site.ts:1-10`, README.md:285-293). Musi być trasą SSR budowaną z `contactEmail()`.

## Detailed Findings

### Pokrycie odpowiedzi przez middleware

- Wszystkie wyjścia `handle()` dają odpowiedzi z modyfikowalnymi nagłówkami:
  - 503 z `unavailableResponse()`: `src/middleware.ts:46`, `:59`; `new Response` w `src/lib/auth-state.ts:61`, `:66`.
  - `context.redirect`: `src/middleware.ts:50`, `:64`, `:70`. Astro buduje go przez `new Response(null, {status, headers})`, `node_modules/astro/dist/core/fetch/fetch-state.js:397-404`.
  - `next()`: `src/middleware.ts:73`.
- Strona 404 jest SSR (`src/pages/404.astro:6`) i renderuje się z middleware, więc też jest pokryta.
- Ryzyko niezweryfikowane: odpowiedź z `Response.redirect()` albo z `fetch()` ma nagłówki tylko do odczytu. Bezpieczny wzorzec to kopia `new Response(res.body, res)` przed `headers.set`.
- Poza pokryciem:
  - **Wyjątek w middleware.** Gałąź catch `src/middleware.ts:74-77` zrzuca wyjątek dalej, a Astro nie ma `500.astro` i odpowiada `new Response(null, {status})` (`core/errors/default-handler.js:106`).
  - **Przekierowania trailing-slash** (`core/routing/trailing-slash-handler.js:18`).
  - **`redirects` z configu** (`redirects/render.js:48-50`).
  - **`src/worker.ts:9`** przekazuje `astro.fetch` bez opakowania. To jedyne miejsce, które złapałoby wszystkie trzy przypadki powyżej.

### Pliki statyczne

- `wrangler.jsonc` ustawia `assets.directory: ./dist` i `not_found_handling: "404-page"` i nie ma `run_worker_first`. Istniejące pliki podaje Cloudflare z pominięciem Workera.
- `public/_headers` ma dziś reguły tylko dla `/sw.js` i `/manifest.webmanifest`.
- Adapter dopisuje przy buildzie regułę `Cache-Control` dla `/_astro/*` (`node_modules/@astrojs/cloudflare/dist/index.js:475-499`), ale pomija ją, gdy istniejąca reguła już ustawia `Cache-Control` (`:486`). Reguła `/*` dla nagłówków bezpieczeństwa nie może więc ustawiać `Cache-Control`.
- Niepewne: czy Cloudflare stosuje `_headers` także do odpowiedzi z Workera. Dokumentacja Cloudflare mówi, że nie. Nie sprawdzono na produkcji.

### CSP w Astro 7.3.2

- Config: `security.csp` (`core/config/schemas/base.js:244-259`). Runtime API: `Astro.csp.insertDirective`, `insertScriptHash` i `insertStyleHash` (`types/public/context.d.ts:480-564`).
- Dyrektywy `frame-ancestors`, `report-uri` i `report-to` są dozwolone w configu (`core/csp/config.js:55-77`). Dla SSR idą w nagłówku, więc działają.
- `<script is:inline>` w `src/components/site/ClearErrorParam.astro:7` wymaga ręcznego hasha. Komentarz w `ClearErrorParam.astro:5` mówi, że strona nie wysyła CSP, więc zmiana musi go poprawić.
- Test Report-Only z `frame.md` (ręczna polityka `'self'` bez hashy) pokazał tylko te elementy, które Astro hashuje automatycznie, plus `form-action`. Wniosek, niezweryfikowany: po włączeniu `security.csp` zostają `is:inline` i `form-action`.
- Tryb Report-Only przez Astro jest niedostępny w przejrzanych plikach `core/csp/*` i `runtime/server/render/*`. Faza Report-Only wymaga więc przepisania nagłówka w middleware (z `content-security-policy` na `content-security-policy-report-only`) albo własnej polityki. Middleware po `next()` widzi nagłówek ustawiony w `page.js:29-30`; wniosek z kolejności wykonania, nie sprawdzony testem.

### Łańcuch logowania Google

- `src/pages/api/auth/google.ts:17-29` woła `signInWithOAuth` i zwraca `context.redirect(data.url)`.
- Produkcja (curl, 2026-10-17): 302 do `wzpgyobsomvjyfrngyuu.supabase.co`, a stamtąd 302 do `accounts.google.com`.
- Originu Supabase nie należy wpisywać na sztywno. Plan może go wyprowadzić z `SUPABASE_URL` (sekret serwera w `astro.config.mjs`).

### security.txt i reguły repo

- `CONTACT_EMAIL` to opcjonalny sekret serwera (`astro.config.mjs:25`), czytany przez `astro:env` (`src/lib/site.ts:1-10`).
- Trasa `src/pages/.well-known/security.txt.ts` z `prerender = false` i wartością z `contactEmail()`. Gdy adresu brak, potrzebna jest decyzja właściciela (np. 404).
- CLAUDE.md (Conventions, privacy policy): zmiana cookies albo dostawców aktualizuje politykę prywatności w tej samej zmianie. Same nagłówki jej nie dotyczą. `report-uri` do zewnętrznego dostawcy już tak.

### Testy

- `tests/integration/middleware.test.ts:34-46` buduje kontekst z fałszywym `redirect` i `next` zwracającym `new Response("page")`. Asercje nagłówków w `:103-104`, `:114` i `:197` sprawdzają pojedyncze nagłówki, więc nowe nagłówki ich nie łamią.
- `scripts/smoke.mjs:69`, `:105-107` czyta tylko `location` i `Set-Cookie`.
- Testów route i unit, które czytają nagłówki, nie przeczytano w całości; żaden z przejrzanych nie wymaga dokładnego zbioru nagłówków.

## Code References

- `src/middleware.ts:46-83`: wyjścia `handle()` i `onRequest`
- `src/worker.ts:9`: `fetch` bez opakowania
- `public/_headers`: reguły plików statycznych
- `src/components/site/ClearErrorParam.astro:5-7`: skrypt `is:inline` i nieaktualny komentarz o CSP
- `src/pages/api/auth/google.ts:17-29`: start logowania Google
- `src/lib/site.ts:1-10`: `contactEmail()`
- `node_modules/astro/dist/runtime/server/render/page.js:29-30`: nagłówek CSP dla SSR
- `node_modules/astro/dist/core/csp/common.js:83-113`: automatyczne hashe

## Architecture Insights

Nagłówki dla stron SSR i plików statycznych muszą iść dwiema drogami: middleware (albo `worker.ts`) oraz `_headers`. CSP najlepiej zostawić Astro, bo liczy hashe przy każdym buildzie. Middleware dokłada nagłówki niezależne od treści i ewentualnie przemianowuje CSP na Report-Only.

## Historical Context (from prior changes)

- `context/archive/2026-10-05-google-login/reviews/impl-review-phase-2.md:138`: przegląd odnotował, że nie sprawdzono, czy projekt ma CSP. Innych decyzji o CSP, HSTS, `X-Frame-Options` ani `security.txt` w archiwum i README nie ma.
- `context/changes/public-surface-hardening/frame.md`: ramy i test Report-Only. **Korekta:** zdanie, że Astro „wstawia politykę jako `<meta>`”, dotyczy tylko stron prerenderowanych. Dla SSR Astro wysyła nagłówek (`page.js:29-30`).

## Related Research

Nie dotyczy.

## Open Questions

1. Wymuszona CSP od razu czy najpierw Report-Only? Jeśli Report-Only, to dokąd raporty: brak, własny endpoint wzorem `src/pages/api/client-errors.ts`, czy zewnętrzny dostawca (wtedy zmiana polityki prywatności).
2. Co `security.txt` zwraca bez `CONTACT_EMAIL`, i jaka data `Expires`?
3. Czy nagłówki ustawiać w middleware (bez pokrycia fallbacku 500 i trailing-slash), czy w `src/worker.ts` (pokrywa wszystko z Workera)?
4. Czy Cloudflare stosuje `_headers` do odpowiedzi Workera (ryzyko duplikatów)? Do sprawdzenia na preview albo produkcji.
