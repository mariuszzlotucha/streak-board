# Frame Brief: Logowanie kontem Google (S-07)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

- Aplikacja ma wyłącznie e-mail+hasło: `src/pages/api/auth/signin.ts:16` (`signInWithPassword`), `src/pages/api/auth/signup.ts:20` (`signUp`). Kod nie zawiera `signInWithOAuth`, a `supabase/config.toml` nie ma `[auth.external.google]` (tylko wyłączony szablon `apple`, `:305`).
- PRD FR-001: „Użytkownik może się zalogować (email/OAuth/passwordless)"; M-1 dowiozło tylko e-mail+hasło.
- Pytanie o zakres (roadmapa S-07): „użytkownik może zarejestrować się i zalogować kontem Google, bez ustawiania hasła".

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: brak jawnej przyczyny; ujęcie z roadmapy: brakującą częścią FR-001 jest logowanie przez Google (OAuth).
- **Proponowany przez użytkownika kierunek**: osobny wycinek S-07 po S-06, z krokami ręcznymi właściciela (projekt i klient OAuth Google, ekran zgody, sekret wyłącznie w panelu Supabase).
- **Zawężenie przed delegowaniem** (Krok 1.5, słowa użytkownika): motywacja = „Tarcie przy rejestracji"; „passwordless" = „Tylko konto Google" (e-mail+hasło zostaje obok); istniejące konta produkcyjne = „Tylko ja i kilku znajomych".

## Mapa wymiarów

Obserwacja może pochodzić z każdego z tych wymiarów:

1. **Problem/motywacja** — czy tarcie to brak Google, czy coś w przepływie potwierdzenia e-mailem. ← ujęcie z roadmapy
2. **Kontrakt callbacku** — jeden `/auth/callback` dla linku e-mail i dla OAuth.
3. **Ciągłość kodu zaproszenia** — cookie `join_code` przez wyjście do Google i powrót.
4. **Tożsamość konta** — ten sam e-mail przez Google vs istniejące konto z hasłem.
5. **Konfiguracja i weryfikowalność** — trzy strony (Google, Supabase, aplikacja), brak przejścia w CI.

## Badanie hipotez

| Hipoteza                                                | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Werdykt                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Tarcie nie leży w braku Google                       | Problemy z wysyłką z M-1 opisane jako naprawione (`deployment-plan.md:132-140`; wysyłka z `noreply@mail.streakboard.app` potwierdzona 2026-09-30 i 2026-10-02, `:191`); brak śladu problemów ze spamem. Ale: link działa tylko w przeglądarce rejestracji (`callback.ts:6-8`), `confirm-email.astro:13-17` bez ponownego wysłania (brak `resend`/`verifyOtp` w `src`), `SignUpForm.tsx:19-47` z polem potwierdzenia hasła.                                                                                                                                                                                                                                                                                                                                                                                 | SŁABE (ramy trzymają: Google usuwa hasło i potwierdzenie dla osób, które go wybiorą; luki ścieżki e-mail zostają poza S-07) |
| 2. Callback jest specyficzny dla linku e-mail           | Każda porażka → `?error=link_expired` (`callback.ts:18,26,31`); `error`, `error_code`, `error_description` nieczytane; tekst „confirmation link has expired" (`auth-errors.ts:9`); surowe `console.error` (`callback.ts:25,30`) wbrew lekcji (`lessons.md:137`); audyt B5 (`context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md`) już to zgłosił. Bramka `release` (`ci.yml:149-153`) i smoke (`scripts/smoke.mjs:346-350`) asercją wymuszają `link_expired` dla wywołania bez `code`. Middleware i strony nie blokują (`middleware.ts:9`: `/auth/callback` nie jest ani chroniony, ani auth).                                                                                                                                                                                     | SILNE (w ramach, ale poza „przyciskiem i trasą")                                                                            |
| 3. Kod zaproszenia ginie w drodze przez Google          | `join_code`: `sameSite: "lax"`, `maxAge: 3600`, bez `domain` (`join-code.ts:14-20`); powrót to nawigacja GET, więc cookie jest wysyłane; ścieżka auth go nie czyści (kasują: `groups/join.ts`, `groups/create.ts`, `signout.ts`, `dashboard.astro`). Luki: cookie przypięte do hosta (`redirectTo` musi mieć origin żądania jak `signup.ts:19-20` i być na liście Supabase); żaden test nie przechodzi zaproszenia przez callback (smoke działa, bo lokalnie `enable_confirmations = false`, `config.toml:209`).                                                                                                                                                                                                                                                                                           | SŁABE dla mechaniki, SILNE dla braku dowodu                                                                                 |
| 4. Model danych lub UI zależy od hasła/e-maila          | Tożsamość to wyłącznie `auth.users.id` (FK: `groups.owner_id`, `group_members.user_id`, `tasks.created_by`, `task_participants.user_id`); brak profili i triggerów na `auth.users`; e-mail tylko do wyświetlania (`list_group_members`, `dashboard.astro:190,275,444`, `leaderboard-rules.ts:51`). Łączenie kont: dowód zewnętrzny (Supabase, identity linking): ten sam zweryfikowany e-mail łączy się automatycznie, „rozdzielić" przy domyślnych ustawieniach nie ma. Wartość produkcyjna „Confirm email" nie jest zapisana w repo (`README.md:255`); wnioskowana jako włączona (`deployment-plan.md:191`).                                                                                                                                                                                             | SŁABE dla danych; SILNE dla jednej niewiadomej (ustawienie z panelu)                                                        |
| 5. Wycinek to głównie konfiguracja i dowód na produkcji | Prod Site URL/Redirect URLs tylko w panelu (`README.md:252-258`, wildcard `https://streakboard.app/**` pokrywa `/auth/callback`); brak `[auth.external.google]` i `signInWithOAuth`; CI startuje stos bez Google (`ci.yml`), smoke używa `redirect:"manual"` (`smoke.mjs:55-85`), Playwright loguje hasłem (`tests/e2e/auth.setup.ts`). Bez prawdziwego konta Google nie da się sprawdzić zgody, wymiany tokenu ani wpisu `redirectTo` (niezgodność = cichy powrót do Site URL). Da się: 302 z trasy startowej do dostawcy, odrzucenie (`?error=access_denied`), przeżycie `join_code`. Dowód zewnętrzny (podsumowania oficjalnych docs): aplikacja produkcyjna z OAuth wymaga publicznej strony głównej i polityki prywatności na własnej domenie; dziś `/` to szablon startowy, strony prywatności brak. | SILNE                                                                                                                       |

## Sygnały zawężające

- Właściciel: motywacja to tarcie przy rejestracji, a zakres to tylko Google (e-mail+hasło zostaje) — domyka niewiadomą roadmapy „czy też link e-mailem".
- Konta produkcyjne to właściciel i znajomi: łączenie kont dotyczy realnie konta właściciela na tym samym adresie Gmail, nie rozstrzygnięcia dla tłumu.
- Kontrola kodu: żadna ścieżka dowodowa nie wskazuje, że zaproszenie ginie przy powrocie z Google; pozostaje brak testu.

## Konwencja między systemami

Dowód zewnętrzny, nie z repo: Supabase prowadzi OAuth przez PKCE z wymianą `code` na sesję (`exchangeCodeForSession`) pod `redirectTo` z listy dozwolonych adresów, a callback dostawcy to `https://<ref>.supabase.co/auth/v1/callback`; sekret lokalnie przez `env(...)`. Obecny `/auth/callback` już realizuje tę samą wymianę dla linku e-mail, więc ujęcie „Google przez ten sam mechanizm" jest zgodne z konwencją. Źródła docs pobrano przez streszczacz (możliwe parafrazy).

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: początkowe ujęcie się potwierdziło — Google jest właściwą odpowiedzią na tarcie przy rejestracji — ale wycinek nie jest „przyciskiem i trasą": to wspólny z linkiem e-mail callback z kontraktem błędu, który dla Google wprowadza w błąd, plus konfiguracja trzech stron i dowód działania, którego CI nie da się dać bez konta Google.

Kod aplikacji (start, przycisk, callback) jest małą częścią. Reszta: mylący komunikat i brak raportowania w callbacku, stałe asercje `link_expired` w smoke i bramce `release`, kolejność konfiguracji zewnętrznej, wymóg strony głównej i polityki prywatności na `streakboard.app` oraz dowód produkcyjny.

## Pewność

- **ŚREDNIA** — dowody z repo są mocne i potwierdzone osobiście, ale (a) wymagania ekranu zgody Google pochodzą z podsumowań dokumentacji, (b) produkcyjne „Confirm email" jest tylko wnioskowane.
- Kroki weryfikacji przed lub w `/10x-plan`: właściciel sprawdza w panelu Supabase Authentication → Email → „Confirm email"; `/10x-research` potwierdza w oficjalnej dokumentacji Google, czy dla zakresów `openid`/`email`/`profile` wymagane są strona główna i polityka prywatności oraz weryfikacja marki, oraz czy tryb „Testing" wystarcza dla grona znajomych.

## Co zmienia się dla /10x-plan

Plan nie może traktować S-07 jako zwykłego wycinka kodu: musi objąć kontrakt callbacka dla obu przepływów (komunikat, raportowanie przez `log.ts`, aktualizacja asercji w `scripts/smoke.mjs` i `ci.yml`), kroki ręczne właściciela po stronie Google i Supabase w ustalonej kolejności oraz sposób dowodu na produkcji, wraz z tym, co da się sprawdzić bez konta Google. Do rozstrzygnięcia w planie zostaje, czy S-09 musi poprzedzić S-07 albo czy wystarczy minimalna strona główna i polityka prywatności. Luki ścieżki e-mail (link w innej przeglądarce, brak ponownego wysłania) leżą poza zakresem „tylko Google" i należy je zapisać jako poza zakresem.

## Odniesienia

- Pliki źródłowe: `src/pages/auth/callback.ts:6-34`, `src/pages/api/auth/signin.ts:16`, `src/pages/api/auth/signup.ts:19-20`, `src/lib/join-code.ts:14-20`, `src/lib/auth-errors.ts:3-32`, `src/middleware.ts:8-9`, `supabase/config.toml:154,173,209,305`, `.github/workflows/ci.yml:149-153`, `scripts/smoke.mjs:346-350`, `README.md:246-258`, `context/foundation/roadmap.md:100-114`
- Powiązane: `context/audits/observability/2026-10-02_check-off-and-uncheck-join-group.md` (B2, B4, B5), `context/archive/2026-10-02-custom-domain/frame.md`
- Powiązane badania: `context/changes/google-login/research.md` (jeszcze nie istnieje)
- Zadania badawcze: n/d (TaskCreate niedostępne w tej sesji; pięć podagentów hipotez uruchomionych równolegle)
