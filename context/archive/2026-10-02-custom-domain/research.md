---
date: 2026-10-02
researcher: Claude (Sonnet 5.5), for Mariusz Złotucha
git_commit: beee6f7
branch: s-06/custom-domain/plan
repository: streak-board
topic: "custom-domain: czy wrangler deploy zachowa wiązanie domeny i co jeszcze trzyma adres aplikacji"
tags: [research, custom-domain, wrangler, cloudflare, supabase-auth, release]
status: partial
last_updated: 2026-10-02
last_updated_by: Claude (Sonnet 5.5)
---

# Research: custom-domain

**Date**: 2026-10-02
**Git Commit**: beee6f7 (lokalne, niezatwierdzone pliki zmiany `context/changes/custom-domain/`)
**Branch**: s-06/custom-domain/plan
**Repository**: streak-board

## Research Question

Dwa pytania z `frame.md` ("Do zbadania w /10x-research"):

1. Czy `wrangler deploy` zachowuje wiązanie domeny dodane w panelu i czy przywraca `workers.dev`, gdy `wrangler.jsonc` nie ma `routes` ani `workers_dev`?
2. Jaki jest dziś stan DNS apexu `streakboard.app`, Site URL i Redirect URLs w Supabase?

## Summary

- **`workers.dev` (rozstrzygnięte w dokumentacji)**: przy konfiguracji bez `route`/`routes` `workers_dev` ma domyślnie wartość `true`, a przy obecnych `routes` domyślnie `false`; wyłączenie w panelu bez `workers_dev = false` w pliku jest cofane przy następnym `wrangler deploy` ([Cloudflare: workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)). Dziś `wrangler.jsonc` nie ma żadnego z tych pól (`wrangler.jsonc:1-14`), więc każdy deploy z CI (`ci.yml:122`) utrzymuje `workers.dev` włączone. Samo dodanie `routes` w repo wyłączy je przy kolejnym deployu, o ile nie ustawimy `workers_dev: true`.
- **Wiązanie Custom Domain dodane w panelu (NIEROZSTRZYGNIĘTE)**: dokumentacja mówi wprost tylko, że "if you change your routes in the dashboard, Wrangler will override them in the next deploy with the routes you have set in your Wrangler configuration file", a żeby zarządzać trasami wyłącznie z panelu, trzeba usunąć `route`/`routes` z pliku i ustawić `workers_dev = false`. Strona o Custom Domains nie opisuje zachowania deployu wobec domeny dodanej w panelu. Nie znalazłem źródła, które mówiłoby, czy Custom Domain (w odróżnieniu od trasy) jest objęty tym nadpisaniem. Nie testowałem tego na koncie (wymaga uprawnień właściciela i zmieniałoby produkcję).
- **Rekomendacja wynikająca z luki**: zadeklarować domenę w repo (`routes: [{ "pattern": "streakboard.app", "custom_domain": true }]`), bo plik konfiguracyjny jest wg dokumentacji źródłem prawdy, a wtedy trwałość wiązania nie zależy od nierozstrzygniętego zachowania. To decyzja dla `/10x-plan`; research jej nie podejmuje.
- **Stan DNS / Supabase (LUKA, tylko właściciel)**: README to zapis z 2026-09-30 (`README.md:252-258`); aktualnych wartości nie da się odczytać z repo.
- **Kod**: potwierdzone, że adres powstaje w dokładnie dwóch miejscach z hosta żądania (patrz niżej), więc po przepięciu kod nie wymaga zmiany.

## Detailed Findings

### Wiązanie Cloudflare i `workers.dev`

- `wrangler.jsonc:1-14` zawiera `name`, `main`, `compatibility_date`, `compatibility_flags`, `assets`, `observability`; brak `routes`, `route`, `workers_dev`, `preview_urls`.
- Jedyna ścieżka wydania to `npx wrangler deploy` w jobie `release` (`.github/workflows/ci.yml:122`), po zatwierdzeniu w środowisku `production`.
- Dokumentacja Wranglera: `workers_dev` "Defaults to `true` when the configuration has no `route` or `routes`, and `false` otherwise"; `custom_domain` domyślnie `false`; `preview_urls` "If omitted, Wrangler does not change an existing setting" ([Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)).
- Dokumentacja `workers.dev`: po dodaniu `routes` bez jawnego `workers_dev` wartość "will be inferred as `false` on the next deploy"; wyłączenie w panelu bez zmiany pliku jest cofane przy deployu ([Cloudflare: workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)).
- Wniosek (wniosek, nie obserwacja z konta): dla obecnego pliku stary adres `workers.dev` jest utrzymywany przez każdy deploy; jego wyłączenie wymaga `workers_dev: false` w repo, a pozostawienie obok domeny wymaga `workers_dev: true` razem z `routes`. To rozstrzyga niewiadomą "los `workers.dev`" po stronie mechanizmu; wybór (zostaje czy znika) należy do użytkownika/planu. Frame: nikt poza właścicielem nie korzysta ze starego adresu.
- Powiązany błąd: [workers-sdk#10722](https://github.com/cloudflare/workers-sdk/issues/10722) opisuje regresję, w której `wrangler deploy` bez routes wyłączał Preview URLs włączone w panelu; zgłoszenie ma powiązany zamknięty PR #10939. Nie sprawdziłem, w której wersji naprawiono; projekt deklaruje `wrangler ^4.131.1` (`package.json:64`), a zainstalowana wersja w głównym checkoucie to 4.131.1. Dotyczy Preview URLs, nie wprost domeny; wskazuje jednak, że deploy potrafi zmieniać ustawienia z panelu, gdy plik ich nie wymienia.
- Pierwsze wiązanie domeny wymaga zatwierdzenia człowieka (`context/foundation/infrastructure.md:82`).

### Adres budowany w kodzie (ta sprawdzona ścieżka)

- `src/pages/api/auth/signup.ts:18`: `emailRedirectTo` = `${new URL(context.request.url).origin}/auth/callback`, więc link w e-mailu wskazuje host, z którego użytkownik wysłał formularz.
- `src/pages/dashboard.astro:131`: `inviteLink` = `${Astro.url.origin}/join/${group.join_code}`.
- `src/pages/auth/callback.ts:6-45`: wymienia `code` na sesję; działa tylko w przeglądarce, w której zapisano weryfikator PKCE (komentarz `callback.ts:6-8`), czyli na tym samym hoście co rejestracja.
- `src/lib/join-code.ts:14-20`: ciasteczko `join_code` bez `domain` (przypięte do hosta). Z frame: `auth-email.ts:15-21` tak samo, sesja Supabase bez `domain`.
- Konsekwencja: rejestracja zaczęta na `workers.dev` i potwierdzona na `streakboard.app` (lub odwrotnie) nie zaloguje; dotyczy tylko jednoczesnego używania dwóch hostów, a frame mówi, że poza właścicielem nikt nie ma konta.

### Bramka wydania i dokumentacja

- `PRODUCTION_URL` jest czytane z `vars` środowiska `production` w kroku "Check the live deployment" (`ci.yml:127-131`) i oczekuje `200` z `/` oraz `302` z `/dashboard`; opisane w `README.md:218`. Wartość zmiennej to ustawienie w GitHubie, nie jest w repo.
- Kolejność ma znaczenie: krok sprawdzający działa po `wrangler deploy` (`ci.yml:122` przed `:127`), więc ustawienie `PRODUCTION_URL` na nowy adres przed tym, jak domena odpowiada, da czerwony `release` po udanym deployu.
- Do aktualizacji tekstów z adresem: `README.md:7`, `:237`, `:250`, `:256`; `context/changes/deployment/deployment-plan.md:66,81,83,87,127,132,185,193` (część to historia i nie powinna być przepisywana, np. wpisy z datą "Resolved 2026-09-18"). `infrastructure.md` nie wymaga zmiany adresu (potwierdza frame; `deployment-plan.md:118`).

### Poczta (Resend)

- Nadawca `noreply@mail.streakboard.app` jest na własnej poddomenie (`README.md:250`), niezależnie od hosta aplikacji; w tej sprawdzonej ścieżce nic w kodzie nie zależy od hosta nadawcy. DNS apexu musi więc tylko nie kolidować z rekordami poddomeny `mail` (konfiguracja DNS Resend nie jest w repo).

## Code References

- `wrangler.jsonc:1-14` - brak `routes`/`workers_dev`
- `.github/workflows/ci.yml:122` - `npx wrangler deploy`
- `.github/workflows/ci.yml:127-131` - kontrola po deployu z `PRODUCTION_URL`
- `src/pages/api/auth/signup.ts:18` - `emailRedirectTo` z `request.url`
- `src/pages/dashboard.astro:131` - link zaproszeniowy z `Astro.url.origin`
- `src/pages/auth/callback.ts:6-8` - PKCE tylko w przeglądarce rejestrującej
- `src/lib/join-code.ts:14-20` - ciasteczko `join_code` bez `domain`
- `README.md:7,218,237,250,252-258` - miejsca z adresem i ustawieniami Supabase
- `context/foundation/infrastructure.md:82` - pierwsze wiązanie domeny zatwierdza człowiek

## Architecture Insights

- Adres aplikacji nie jest jedną wartością w repo: żyje w Cloudflare (wiązanie), Supabase (Site URL, Redirect URLs), GitHubie (`PRODUCTION_URL`) i dokumentacji; kod wyprowadza go z żądania.
- Wrangler traktuje plik jako źródło prawdy dla tras i `workers_dev`; to uzasadnia przeniesienie deklaracji domeny do `wrangler.jsonc` zamiast zostawiania jej w panelu.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-release-automation-and-auth-hardening/change.md:12` - `PRODUCTION_URL` wymieniona w tej zmianie (wg frame); nie czytałem pełnego dokumentu.
- `context/changes/deployment/deployment-plan.md:132` - pierwszy incydent: Site URL domyślnie `http://localhost:3000`. `README.md:257` - drugi: brak wpisu na liście Redirect URLs, cichy powrót do Site URL.
- `context/changes/deployment/deployment-plan.md:193` - "Custom domain binding — deferred" (nadal aktualne do czasu tej zmiany).
- `lessons.md`: wycinek zamyka się mergem, zatwierdzeniem `release` i ręczną kontrolą głównego przepływu na adresie produkcyjnym oraz wpisem w `deployment-plan.md`.

## Related Research

Brak (`context/changes/**/research.md` i archiwum nie przeszukiwane pod kątem tego tematu poza powyższymi wskazaniami).

## Open Questions

1. **Luka (blokuje pewność, nie plan)**: czy Custom Domain dodany w panelu przetrwa `wrangler deploy` bez `routes` w pliku. Brak dowodu w dokumentacji; sprawdzić można tylko na koncie. Plan może to obejść deklaracją `routes` z `custom_domain: true` w repo. Wtedy trzeba też zdecydować o `workers_dev`.
2. **Stan panelu (tylko właściciel)**: rekordy DNS apexu `streakboard.app` (czy istnieje rekord kolidujący z Custom Domain), aktualne Site URL i Redirect URLs w Supabase, aktualna wartość `PRODUCTION_URL`.
3. **Decyzja produktowa**: zostawić `workers.dev` równolegle na czas przepięcia (ścieżka powrotu), czy wyłączyć; `www.streakboard.app` (domyślnie poza zakresem); `site` w `astro.config.mjs` (poza zakresem).
4. Wersja Wranglera, w której naprawiono #10722, nie została sprawdzona.
