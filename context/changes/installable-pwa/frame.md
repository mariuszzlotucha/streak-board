# Frame Brief: Aplikacja do zainstalowania (PWA)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

Opis właściciela z 2026-10-17: „Żeby aplikacja była PWA” — użytkownik instaluje StreakBoard na ekranie głównym telefonu (albo na komputerze) i uruchamia go jak osobną aplikację, z własną ikoną i bez paska przeglądarki (roadmapa S-17, MS-03).

## Początkowe ujęcie (zachowane)

- **Podana przyczyna lub podejście**: „PWA” = manifest aplikacji + większe ikony + service worker; bez trybu offline (PRD §Non-Goals), strony po zalogowaniu nie trafiają do cache (roadmapa S-17 §Risk).
- **Proponowany kierunek**: zaplanować S-17 jako zmianę instalowalności.
- **Zawężenie przed delegowaniem** (odpowiedzi właściciela 2026-10-17):
  - po co PWA: **oba** — codzienny dostęp z ekranu głównego i podstawa pod powiadomienia push z S-16;
  - urządzenia grupy: **mieszane** (iOS, Android, możliwe komputery);
  - brak sieci w zainstalowanej aplikacji: **cokolwiek się stanie** — żadnego własnego ekranu offline.

## Mapa wymiarów

Cel „zainstalowana aplikacja, której grupa używa codziennie” może się nie spełnić w każdym z tych wymiarów:

1. **Instalowalność** — brak manifestu, ikon w wymaganych rozmiarach, koloru motywu i service workera, więc przeglądarka nie oferuje instalacji albo ikona jest zła. ← początkowe ujęcie
2. **Logowanie i wejścia z zewnątrz w trybie standalone** — logowanie Google przekierowuje poza domenę, link potwierdzający e-mail i link zaproszenia `/join/<code>` otwierają się z poczty lub komunikatora w przeglądarce, a nie w zainstalowanej aplikacji; na iOS aplikacja z ekranu głównego ma osobny magazyn cookies, więc sesja lub ciasteczko `join_code` może trafić do Safari zamiast do aplikacji.
3. **Service worker jako wspólna podstawa z S-16** — skoro PWA ma też umożliwić push, zakres i rejestracja service workera muszą pasować do tego, czego S-16 dołoży; na iOS web push działa tylko w aplikacji dodanej do ekranu głównego.
4. **Pamięć podręczna i aktualizacje** — cache stron po zalogowaniu (cudzy dashboard na wspólnym urządzeniu) albo stary kod po wydaniu.

## Badanie hipotez

| Hipoteza                                        | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Werdykt                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Instalowalność: brakuje manifestu, ikon i SW | `src/layouts/Layout.astro:20-21` ma tylko `favicon.svg` i `favicon.png` 48×48; `public/` zawiera tylko te dwa pliki; brak manifestu i service workera (roadmapa §Baseline „PWA: absent”)                                                                                                                                                                                                                                                                                                                                | SILNE (konieczne, ale niewystarczające)                                     |
| 2. Logowanie i wejścia z zewnątrz w standalone  | `src/pages/api/auth/google.ts:30` przekierowuje na zewnętrzny `data.url` (Supabase → Google); `src/pages/api/auth/signup.ts:19` — link potwierdzający wraca na `/auth/callback` z poczty; `src/pages/join/[code].ts` zapisuje kod w cookie i przekierowuje — link zwykle otwierany z komunikatora; sesja wyłącznie w cookies (`src/lib/supabase.ts`). Zachowanie iOS (osobne cookies w aplikacji z ekranu głównego, otwieranie stron spoza domeny) to wiedza ogólna, **niezweryfikowana na urządzeniu w tym projekcie** | SŁABE→ŚREDNIE (ścieżki w kodzie potwierdzone, skutek na iOS do sprawdzenia) |
| 3. SW jako wspólna podstawa z S-16              | odpowiedź właściciela „oba”; roadmapa S-16 §Unknowns (push na iOS wymaga instalacji), S-17 §Risk („S-17 idzie pierwszy przy kanale push”); kanał S-16 nadal nierozstrzygnięty                                                                                                                                                                                                                                                                                                                                           | ŚREDNIE                                                                     |
| 4. Pamięć podręczna i aktualizacje              | odpowiedź „cokolwiek się stanie” — SW nie musi niczego cache'ować; dziś `no-store` tylko w `src/lib/checkoff-response.ts:21` i `src/lib/auth-state.ts:59`                                                                                                                                                                                                                                                                                                                                                               | SŁABE (ryzyko znika, jeśli SW nie cache'uje stron)                          |

## Sygnały zawężające

- „Oba” — PWA nie jest celem samym w sobie; to dostęp z ekranu głównego **i** warunek wstępny dla push z S-16. Wymiar 3 wchodzi do zakresu.
- „Mieszane urządzenia” — iOS jest w grze, więc wymiar 2 (osobne cookies, brak monitu instalacji na iOS) nie jest teoretyczny.
- „Cokolwiek się stanie” offline — SW nie potrzebuje pamięci podręcznej stron; wymiar 4 zmniejsza się do „nie cache'uj niczego po zalogowaniu i nie przetrzymuj starego kodu”.

## Konwencja między systemami

Typowa „PWA bez offline” to manifest + ikony (w tym maskowalne i `apple-touch-icon` dla iOS) + minimalny service worker bez cache stron. Typowa pułapka aplikacji z logowaniem przez cookies i OAuth to właśnie tryb standalone na iOS: przekierowania spoza domeny i linki z poczty lądują w przeglądarce, nie w aplikacji. Wymiar 1 jest zgodny z konwencją, a wymiar 2 jest jej znanym przypadkiem brzegowym.

## Przeformułowany opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: zainstalowana aplikacja ma przejść cały codzienny cykl — instalacja, zalogowanie (e-mail i Google), dołączenie z linku zaproszenia, odznaczenie — na iOS i Androidzie, a jej service worker ma być podstawą, na której S-16 doda push.

Początkowe ujęcie (manifest + ikony + SW bez offline) jest **prawidłowe, ale niepełne**: opisuje to, co pozwala zainstalować aplikację, a nie to, czy da się z niej korzystać po instalacji. Bez sprawdzenia logowania i linków w trybie standalone na iOS można dostarczyć ikonę, która otwiera ekran logowania, z którego nie da się wejść.

## Pewność

**ŚREDNIA** — wymiary 1 i 3 są potwierdzone kodem i odpowiedziami właściciela; skutek wymiaru 2 opiera się na znanym zachowaniu iOS, niezweryfikowanym w tym projekcie.

Weryfikacja (decyzja właściciela 2026-10-17: właściciel nie ma iPhone'a):

- **Android i komputer (Chrome/Edge)** — właściciel sprawdza przed merge'em: instalacja, logowanie e-mail, logowanie Google, link `/join/<code>`, odznaczenie.
- **iOS** — sprawdza członek grupy z iPhone'em **po wydaniu**, według krótkiego scenariusza (te same kroki przez Safari „Do ekranu początkowego”). Do jego wyniku zachowanie logowania na iOS jest jawnym, otwartym ryzykiem, a nie potwierdzonym kryterium sukcesu.

## Co zmienia się dla /10x-plan

Plan obejmuje nie tylko artefakty instalacji, ale też kryteria sukcesu dla logowania i linków zaproszeń w zainstalowanej aplikacji na Androidzie i komputerze (ręczna checklista właściciela przed merge'em) oraz scenariusz sprawdzenia iOS dla członka grupy po wydaniu, z otwartym ryzykiem do czasu jego wyniku oraz kształt service workera, który S-16 rozszerzy o push bez przepisywania. Brak ekranu offline i brak cache stron to decyzje, a nie luki.

## Odniesienia

- Pliki źródłowe: `src/layouts/Layout.astro:20-21`, `src/pages/api/auth/google.ts:17-30`, `src/pages/api/auth/signup.ts:19`, `src/pages/join/[code].ts`, `src/lib/supabase.ts`, `wrangler.jsonc` (assets z `./dist`)
- Roadmapa: `context/foundation/roadmap.md` §S-17, §S-16 Unknowns, §Baseline
- PRD: `context/foundation/prd.md` §Non-Goals (offline), §Non-Functional Requirements (smartfon)
- Zadania badawcze: brak — obszar mały, odczyty wykonane bezpośrednio
