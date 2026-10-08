# Frame Brief: Strona startowa dla niezalogowanych (S-09)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

S-09 / MS-03: niezalogowany użytkownik ma widzieć stronę startową, która tłumaczy, czym jest aplikacja, i prowadzi do rejestracji lub logowania (`context/foundation/roadmap.md`, S-09; `roadmap-input-next-slices.md`, sekcja „3. landing-page"). Roadmapa zakłada przy tym, że „`/` to nadal szablon startowy („10x Astro Starter")" (Baseline, Risk S-09).

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: nowy widok, a ściślej przepisanie szablonu `/`; zwykły łańcuch od `/10x-frame`, `/10x-ui` dopiero przy późniejszych poprawkach.
- **Proponowany przez użytkownika kierunek**: przepisać `/` na stronę produktu; ewentualnie przekierować zalogowanego i pokazać podgląd tablicy wyników; zachować przekierowanie `error_code` → `/auth/signin?error=oauth_failed`; dodać kroki smoke sprawdzające wynik; polityka prywatności przechodzi tu z S-07 (bramka publikacji aplikacji Google).
- **Zawężenie przed delegowaniem** (Krok 1.5, wybory użytkownika):
  - Kto trafi na `/`: „Obcy z publicznego linku" (adres będzie podawany publicznie, nie tylko w linkach `/join/<kod>`).
  - Co dziś przeszkadza: „Treść `/` za słaba", „Brak polityki prywatności", „Wygląd/zaufanie strony" (wszystkie trzy).
  - Czy Safe Browsing nadal oznacza domenę: „Nie sprawdzałem".

## Mapa wymiarów

Obca osoba z publicznego linku może nie dojść od `/` do konta w każdym z tych miejsc:

1. **Treść `/`**: strona nie tłumaczy obcej osobie wartości z PRD. ← początkowe ujęcie (z poprawką: to nie szablon)
2. **Ścieżka do konta przez Google**: aplikacja Google w statusie Testing odrzuca osobę spoza listy testerów, więc strona „prowadzi" do logowania, które nie działa.
3. **Zaufanie i osiągalność domeny**: Google Safe Browsing oznacza `streakboard.app`, więc obca osoba widzi ostrzeżenie przeglądarki, zanim zobaczy treść.
4. **Kontrakty `/` i stan zalogowanego**: przepisanie łamie przekierowanie `error_code`, smoke, bramkę `release` albo zachowanie dla zalogowanych.

## Badanie hipotez

| Hipoteza                                                    | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Werdykt                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1. Treść `/`: brak wyjaśnienia produktu (początkowe ujęcie) | `/` NIE jest szablonem: commit `35b08ea` (2026-10-02) dał hero „StreakBoard", hasło „Build habits together…", Sign In/Sign Up i trzy karty (`src/components/Welcome.astro:21-112`). Hasło jest ogólne i nie mówi o tym, co PRD nazywa wartością: kilka osób śledzi ten sam cel i widzi nawzajem swoją konsekwencję, zamiast ręcznie kolorowanego arkusza (`prd.md`, Vision). Ikony nie pasują do treści (kłódka, `</>`), styl „kosmiczny" (`bg-cosmic`, twarde kolory) odbiega od tokenów shadcn używanych w auth i dashboardzie (`global.css:13-92,125-127`, `auth/signin.astro:5-28`). Brak stopki, polityki prywatności, jakiejkolwiek strony poza auth.                                                                                            | SŁABE (treść jest, ale za ogólna i niespójna) |
| 2. Google w Testing odrzuca obcych                          | Najbardziej szczegółowy tekst Google (Manage App Audience, support.google.com/cloud/answer/15549945, pobrane 2026-10-08): przy samych `openid`/`email`/`profile` użytkownicy „do not need to be in the trusted user list", także dla Sign in with Google. Inne strony Google przeczą sobie (ostrzeżenie „app is in testing"; limit 100). Polityka prywatności i link do niej na stronie głównej są „required for all external production apps" i do weryfikacji marki, nie do samego logowania. `README.md:265` („every person … must be listed as a test user") najpewniej przesadza; nie testowano na żywo.                                                                                                                                          | SŁABE                                         |
| 3. Safe Browsing oznacza domenę                             | Transparency Report API: `streakboard.app` → status `3` („Some pages on this site are unsafe"), flaga social engineering = `true`, ostatnia aktualizacja 2026-10-05 22:18 UTC, czyli po przepisaniu treści w `35b08ea`. Kontrola: `example.com` → `1`, bez flag; testowa strona phishingowa Google → `2`, ta sama flaga. Flaga pochodzi z 2026-10-02 (szablon obok przycisków logowania, komunikat `35b08ea`) i nigdy nie została zamknięta (`context/archive/2026-10-05-google-login/research.md:271`). Search Console (właściciel, 2026-10-08, usługa „Domain" `streakboard.app`): „Security issues" pokazuje 1 problem, „Strony wprowadzające w błąd" (deceptive pages), przykładowe URL-e: „Nie dotyczy"; Chrome ostrzega przy wejściu na witrynę. | SILNE                                         |
| 4. Kontrakty `/` i zalogowany                               | `index.astro:8-12` (przekierowanie trzech kodów flow-state); smoke: `/` tylko statusem 200 (`smoke.mjs:346,460`), kody `error_code` (`:449-458`), sign-out → `/` (`:1757`, `api/auth/signout.ts:16`); `ci.yml:84` czeka na `/`, bramka `release` wymaga 200 z produkcyjnego `/` (`ci.yml:165-169`). Playwright nie odwiedza `/`, brak baseline'ów zrzutów. Zalogowany widzi tę samą stronę z innym Topbarem (`Topbar.astro:6-19`); middleware przekierowuje zalogowanego tylko z `/auth/signin` i `/auth/signup` (`middleware.ts:39-42`).                                                                                                                                                                                                              | SILNE jako ograniczenia, nie jako przyczyna   |

## Sygnały zawężające

- Odbiorca to obca osoba z publicznego linku, więc liczy się pierwsze wrażenie domeny i strony, a nie tylko droga zaproszonych przez `/join/<kod>` (ci omijają `/`: `join/[code].ts:8-11` → `/dashboard` → `/auth/signin`).
- Obietnica strony: **wspólny cel i widoczność** (kilka osób śledzi ten sam nawyk i widzi nawzajem swoją konsekwencję, zamiennik wspólnego arkusza), zgodnie z wizją PRD. Obecne hasło jej nie wyraża.
- Język strony: **angielski**, spójnie z resztą aplikacji (`Layout.astro:17`, auth, dashboard; jedyne polskie teksty to baner braku konfiguracji, `Layout.astro:28,33`, `config-status.ts:15,17`).
- Zachowanie: **zalogowany → `/dashboard`**; **bez podglądu tablicy wyników**.
- Search Console (zweryfikowane 2026-10-08): jeden problem „Strony wprowadzające w błąd", bez przykładowych URL-i, więc nie da się zawęzić naprawy do jednej strony; przegląd będzie oceniał witrynę jako całość.
- Kolejność (decyzja właściciela, 2026-10-08): najpierw poprawiona strona startowa i polityka prywatności, wdrożenie na produkcję, a dopiero potem zgłoszenia do Google; polityka prywatności i powiązane strony muszą istnieć na produkcji przed zgłoszeniem.

## Konwencja między systemami

Ostrzeżenie Safe Browsing nie znika samo po zmianie treści: standardowa droga to weryfikacja domeny w Google Search Console, raport „Security issues" (lista oznaczonych URL-i), usunięcie przyczyny i „Request review". Strona startowa, która opisuje produkt, identyfikuje właściciela i linkuje politykę prywatności, jest jednocześnie tym, czego Google wymaga od strony głównej aplikacji OAuth (Branding: „can not be only a login page", link do polityki na tej samej domenie). Obie potrzeby wskazują na ten sam zestaw stron, ale flagi nie zdejmuje kod, tylko przegląd po stronie Google.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: obca osoba z publicznego linku do `streakboard.app` trafia dziś na ostrzeżenie Safe Browsing (social engineering), a za nim na ogólną stronę bez polityki prywatności, więc S-09 musi dać stronę, której można zaufać i która wyraża obietnicę „wspólny cel, widoczność", oraz doprowadzić do zdjęcia flagi.

Początkowe ujęcie było częściowo trafne: treść `/` trzeba przepisać, ale nie z szablonu, tylko z ogólnego opisu na obietnicę z PRD, w stylu tokenów aplikacji. Zmienia się zakres: dochodzi polityka prywatności (wymagana przez Google dla strony głównej i potrzebna przy przeglądzie flagi), przekierowanie zalogowanego na `/dashboard` oraz krok właściciela poza kodem: Search Console i prośba o przegląd, z dowodem na produkcji, że flaga zniknęła. Bez tego publiczny link nie dowozi wyniku MS-03, niezależnie od jakości strony. Ścieżka Google nie jest przeszkodą dla obcych (najpewniej działa w Testing); publikacja aplikacji Google nie jest warunkiem S-09.

## Pewność

**ŚREDNIA.** Flaga jest potwierdzona dwoma źródłami (Transparency Report API z kontrolami oraz Search Console: „Strony wprowadzające w błąd"), a kontrakty `/` są zmapowane. Nieznane: dlaczego flaga przetrwała przepisanie treści w `35b08ea` (Google nie podał przykładowych URL-i) oraz czy flagę zdejmie sam przegląd obecnej strony, czy dopiero nowa strona z polityką prywatności; o tym rozstrzyga wynik prośby o przegląd, nie dalsze czytanie kodu. Drugorzędne: czy osoba spoza listy testerów faktycznie loguje się Google (test jednym obcym kontem), bo `README.md:265` twierdzi inaczej.

## Co zmienia się dla /10x-plan

Plan nie jest „przepisaniem szablonu `/`": obejmuje nową treść `/` (angielski, obietnica „wspólny cel, widoczność", tokeny shadcn zamiast `bg-cosmic`), stronę polityki prywatności z linkiem w stopce (dane z sekcji 3 raportu: e-mail w `auth.users` widoczny dla grupy, cookies `sb-*`, `join_code`, `auth_email`, Workers Logs, Sentry, Resend, Cloudflare, Supabase, Google), przekierowanie zalogowanego z `/` na `/dashboard` z zachowaniem przekierowania `error_code`, kroki smoke sprawdzające treść i cele linków oraz krok właściciela w Search Console z prośbą o przegląd i sprawdzeniem statusu Safe Browsing na produkcji. Plan powinien też poprawić `README.md:265`, jeśli test obcym kontem potwierdzi, że lista testerów nie jest wymagana.

**Bramka przed `/10x-archive` (decyzja właściciela, 2026-10-08).** Plan kończy się fazą zamknięcia po wydaniu, a `/10x-archive` nie rusza, dopóki właściciel nie potwierdzi każdego punktu:

1. Na produkcji działają nowa strona `/` i polityka prywatności (oraz inne strony, które plan uzna za wymagane przez Google, np. warunki korzystania), z linkiem do polityki widocznym na stronie głównej.
2. Search Console: wysłana prośba o przegląd („Security issues" → „Request review") z opisem zmian, po wdrożeniu z punktu 1.
3. Google Auth Platform → Branding: wpisane adresy strony głównej i polityki prywatności (te same co na produkcji) oraz `streakboard.app` w autoryzowanych domenach.
4. Wynik przeglądu: Search Console nie pokazuje problemu, a Transparency Report zwraca dla `streakboard.app` status bez flag; data i wynik zapisane w `context/changes/deployment/deployment-plan.md`.

Jeśli przegląd zostanie odrzucony, slice zostaje otwarty: poprawka i ponowne zgłoszenie należą do S-09. Publikacja aplikacji Google (Testing → In production) nie jest warunkiem tej bramki, chyba że plan postanowi inaczej.

## Odniesienia

- Pliki źródłowe: `src/pages/index.astro:8-12`, `src/components/Welcome.astro:21-112`, `src/components/Topbar.astro:6-19`, `src/layouts/Layout.astro:10-33`, `src/middleware.ts:34-42`, `src/pages/join/[code].ts:8-11`, `src/pages/api/auth/signout.ts:16`, `src/styles/global.css:13-127`, `scripts/smoke.mjs:346,449-460,1757`, `.github/workflows/ci.yml:84,165-169`, `README.md:265,290-294`
- Dane osobowe (do polityki): `supabase/migrations/20260925161234_add_group_member_list_and_preview.sql:4-19`, `src/lib/supabase.ts:15-17`, `src/lib/join-code.ts:4-20`, `src/lib/auth-email.ts:3-21`, `src/lib/log.ts:69-129`, `src/lib/redact.ts:3-11`, `src/lib/sentry-options.ts:16-41`, `src/pages/api/auth/google.ts:18`
- Wcześniejsze decyzje: `context/archive/2026-10-05-google-login/research.md:41-110,192,271`, `context/archive/2026-10-05-google-login/plan.md:7,19,41`, commit `35b08ea`
- Źródła zewnętrzne (2026-10-08): Google Transparency Report API (`transparencyreport.google.com/transparencyreport/api/v3/safebrowsing/status?site=streakboard.app`); support.google.com/cloud/answer/15549945 (Audience), /15549049 (Branding), /13464323, /13463073; developers.google.com/identity/protocols/oauth2/production-readiness/overview i …/brand-verification
- Zadania badawcze: agent „Google OAuth Testing vs publishing", agent „Map / contracts and personal data"
