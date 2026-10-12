---
change_id: dashboard-ui
title: Dashboard ui
status: impl_reviewed
created: 2026-10-09
updated: 2026-10-12
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap: S-11 (`context/foundation/roadmap.md`). Gałąź planowania: `s-11/dashboard-ui/plan`.

## Zakres zmiany wizualnej (/10x-ui, 2026-10-11)

- **Widok (jeden):** `/dashboard`: `src/pages/dashboard.astro`, karty z `src/components/dashboard/*` i wyspy, które one renderują (`src/components/tasks/*`, `src/components/groups/*`), oraz współdzielone `FormField` i `SubmitButton` z `src/components/auth/`. `SiteFooter` tylko jako element tego widoku. Landing, polityka prywatności i strony auth są poza zakresem.
- **Źródło tokenów:** istniejący system, preset shadcn `b7Br7G9Kq` (`radix-maia`, baza `mist`, primary szmaragdowy, font Outfit Variable) w `src/styles/global.css`: wartości w `:root` i `.dark`, publikowane przez `@theme inline`. Surowe wartości presetu: `context/archive/2026-09-25-ui-styles-audit/tokens-source/`. Komponenty: `src/components/ui/` (`alert`, `alert-dialog`, `button`, `card`, `input`, `label`), nowe przez `npx shadcn@latest add <name>`.
- **Wariant kontraktu:** istniejący system projektowy. Rozszerzamy go: bez drugiej palety i bez `shadcn init`. Nowy token (np. `--success`) trafia do tego samego bloku `:root` / `.dark` / `@theme inline`; jego surowa wartość i źródło lądują w `context/changes/dashboard-ui/tokens-source/`.
- **Dark mode:** poza zakresem. Blok `.dark` istnieje, ale nic go nie włącza (w `src` nie ma przełącznika ani `prefers-color-scheme`).

## Przed-audyt (2026-10-11, commit `7340675`)

Liczby z czytania kodu, bez uruchamiania aplikacji. To kandydaci do zarzutów, nie werdykty.

- **Skan zakodowanych wartości** (wzorzec ze skilla `/10x-ui`): 1 trafienie w plikach widoku, `src/components/tasks/CreateTaskForm.tsx:58` (`focus-visible:ring-[3px]` na ręcznie zbudowanym `<select>`). Pozostałe 9 trafień to hex w `src/components/Banner.astro:28-40`, a ten komponent renderuje `src/layouts/Layout.astro:27-40` nad każdą stroną. Klas palety w widoku: 0.
- **Źródło → widok:** wszystkie 9 plików, które renderują karty (8 w `dashboard/` i `Leaderboard.tsx`), importuje `ui/card`. Formularze grup i tasków (`CreateTaskForm`, `EditTaskForm`, `CreateGroupForm`, `JoinGroupForm`, `RenameGroupForm`) biorą `FormField` i `SubmitButton` z `src/components/auth/`, a nie z `ui/`. Kolory tokenów idą głównie przez komponenty `ui/`; bezpośrednich klas ról jest w widoku niewiele (od 0 do 7 na plik).
- **Widok → źródło (kandydaci):**
  - ręczna pigułka-badge powtórzona 6 razy (`MembersCard.astro:31,36`, `TaskRow.astro:33,50,67`, `Leaderboard.tsx:35`); w `ui/` nie ma `badge`;
  - ręczny `<select>` w `CreateTaskForm.tsx:54-65`, który naśladuje `Input`; w `ui/` nie ma `select` ani `native-select`;
  - 10 nagłówków kart nadpisuje typografię `CardTitle` własnymi klasami: 9 razy `font-heading text-xl font-semibold` (np. `MembersCard.astro:21`, `TasksCard.astro:27`, `Leaderboard.tsx:24`), a nagłówek grupy `text-2xl` (`GroupHeaderCard.astro:17`). Powód: `CardTitle` renderuje `div` (`ui/card.tsx:31-32`);
  - brak tokenu stanu „zrobione” lub sukcesu (`--success`): „Done today” to zwykły tekst (`CheckoffControl.tsx:108`).
- **Przypadkowa architektura (kandydaci):**
  - powłoka strony logowania na dashboardzie (`dashboard.astro:51-52`: `min-h-screen items-center justify-center`, `max-w-md`);
  - jedna kolumna z maksymalnie 7 kartami o tej samej wadze, ułożonymi w kolejności dodawania funkcji: grupa, członkowie, taski, tablica wyników, zmiana nazwy, usunięcie grupy, konto (`dashboard.astro:60-90`);
  - dashboard nie ma nagłówka z marką (`Layout.astro` zamiast `PublicLayout.astro`, a `SiteHeader` celowo nie ma wariantu dla zalogowanych), „Sign out” leży na samym dole;
  - błąd `?error=` pokazuje się na górze strony (`dashboard.astro:53-58`), daleko od akcji, która go wywołała;
  - komunikaty o częściowej awarii ładowania są szarym `text-xs` (`TasksCard.astro:47-52`).
- **Plik reguł agenta:** `CLAUDE.md` (`AGENTS.md` to symlink do niego). Linia 23 mówi o stylu „new-york”, a `components.json` ma `radix-maia`. Brak reguły o tokenach, o zakazie literałów w widokach i o kitchen sink. Reguły zachęcającej do jednorazowych wartości nie ma.
- **Drobne:** linia źródła w `src/styles/global.css:3` wskazuje `context/changes/ui-styles-audit/…`, a ten folder jest już w `context/archive/2026-09-25-ui-styles-audit/`.
- **Bramka wizualna:** Playwright jest skonfigurowany (`playwright.config.ts`: projekt `setup` ze `storageState`, `screenshot: "only-on-failure"`), ale `tests/e2e` nie używa `toHaveScreenshot`, a `.github/workflows/ci.yml` nie uruchamia e2e. Precedens kitchen sink: `src/pages/dev/signin-kitchen-sink.astro` (tylko w dev, w buildzie produkcyjnym zwraca 404).
- **Ograniczenia dla planu:** według `context/foundation/roadmap-input-next-slices.md:70` (niezweryfikowane w samym skrypcie) `scripts/smoke.mjs` (1912 linii) dopasowuje obecny markup: jeden `<li>` na task bez zagnieżdżonych `<li>`, `role="alert"` tylko dla błędów, `<ol aria-label="Leaderboard">`, liczby w osobnych elementach. Wyspy optymistyczne (`CheckoffControl`, `Leaderboard`) muszą renderować na serwerze ten sam HTML co w pierwszym renderze klienta. PRD wymaga pełnej użyteczności na smartfonie i natychmiastowego odznaczania. Testy `loadDashboard`: `tests/unit/dashboard-data.test.ts`.

## Brief audytowy dla /10x-research

Pytanie badawcze: **jakie 3–5 zarzutów ma widok `/dashboard` względem kontraktu systemu projektowego (tokeny presetu `b7Br7G9Kq` w `src/styles/global.css` i komponenty `src/components/ui/`) i co z tego wynika dla planu?** Audyt robimy przed jakimkolwiek CSS. Bez zmian w kodzie.

1. **Dwa kierunki.**
   - _Źródło → widok:_ gdzie żyją wartości i komponenty i które pliki widoku je czytają. Policz na plik klasy ról tokenów i importy z `ui/`.
   - _Widok → źródło:_ dla każdego literału, ręcznego prymitywu i nadpisania typografii wskaż token albo komponent, który powinien go pokryć.
   - Zweryfikuj kandydatów z przed-audytu; nie przepisuj ich bez sprawdzenia.
2. **Zarzuty.** Zapisz je w `research.md` pod `## Charges`: 3–5 zarzutów, każdy z kategorią (brakujące tokeny, brakujący współdzielony komponent, przypadkowa architektura), `plik:linia` i jednym zdaniem o wpływie na użytkownika. Kierunek poprawki opisz bez kodu. Zarzuty poza zakresem zostają jako **deferred** z powodem, na przykład `Banner.astro`: sprawdź, czy może się w ogóle wyrenderować na `/dashboard`, skoro brak konfiguracji Supabase oznacza brak sesji i przekierowanie. Podobnie strona 503 w `src/lib/auth-state.ts:43-55`.
3. **Punkty wejścia.** Odpowiedz wprost, co widzi użytkownik, który trafia na `/dashboard`:
   - wylogowany;
   - przy awarii Auth (503);
   - bez grupy;
   - z grupą bez tasków;
   - jako jedyny członek grupy;
   - z linku zaproszenia (`/join/[code]`, też gdy jest już w grupie);
   - z `?error=`;
   - przy częściowych awariach (`loadFailed`, `tasksFailed`, `participantsFailed`, `checkoffsFailed`).

   Sprawdź też kolejność i poziomy nagłówków w każdym z tych stanów (np. `<h2>` z `PendingInviteCard` przed `<h1>` z `NoGroupCards`).

4. **Czytelność układu.** To cel S-11, ale oceniamy go po kontrakcie. Opisz hierarchię:
   - co jest głównym działaniem: odznaczenie taska i tablica wyników;
   - które karty konkurują z nim wagą;
   - gdzie są akcje niebezpieczne;
   - jak wygląda strona przy 375 px i na desktopie.

   Zrzuty „przed” (desktop i jedna szerokość mobilna, kilka stanów) zapisz w `context/changes/dashboard-ui/screenshots/`, jeśli da się uruchomić aplikację lokalnie.

5. **Inwentarz macierzy 7 stanów** (default, hover, focus-visible, disabled, error, empty, loading) dla kontrolek widoku. Dla każdej komórki podaj, co istnieje dziś, gdzie (`plik:linia`), albo N/A z powodem. Przykład: brak skeletonu strony przy SSR, ale są stany oczekiwania akcji w `SubmitButton`, `ConfirmAction` i `CheckoffControl`. Uwzględnij działanie formularzy przed hydracją (`client:load`).
6. **Plik reguł agenta.** Sprawdź `CLAUDE.md` pod kątem instrukcji UI: nieaktualne „new-york” w linii 23 i brak reguły o tokenach i komponentach. Wskaż, co reguła „Utrwal to” musi powiedzieć. Sprawdź też, czy `eslint.config.js` i lint-staged mogą unieść kontrolę zakodowanych wartości ograniczoną do plików tego widoku (bez nowej zależności).
7. **Ograniczenia i bramka.**
   - Wypisz asercje `scripts/smoke.mjs` i selektory `tests/e2e/*`, które wiążą markup dashboardu, z `plik:linia`.
   - Wypisz miejsca, gdzie wymagana jest zgodność HTML serwera i klienta.
   - Wybierz formę bramki wizualnej: kitchen sink tylko w dev (precedens signin) albo `toHaveScreenshot` na istniejącym Playwright z maskowaniem zmiennych regionów. Nic nie instaluj.
8. **Wcześniejsze decyzje.** Przejrzyj `context/archive/2026-09-25-ui-styles-audit/` (`charges.md`: odroczone tokeny `--success`/`--warning`, restyl dashboardu odroczony) oraz decyzje S-04 i S-11 w `context/archive/2026-10-01-checkoff-and-leaderboard/` i `context/foundation/roadmap.md`, żeby nie odkrywać ich na nowo.

Wynik trafia do `research.md`:

- `## Charges` z zarzutami i listą deferred;
- tabela liczników ze skanu na plik (punkt odniesienia; po każdej fazie liczba ma spadać);
- inwentarz 7 stanów;
- ograniczenia dla planu (smoke, e2e, hydracja, mobile).

Fazy planu: środowisko/biblioteka → wartości tokenów → jeden widok → stany.

## Wynik zarzutów, odroczenia i przekazania (faza 2, 2026-10-12)

Zarzuty z `research.md` (`## Charges`):

- **C1 (układ) — naprawiony w fazie 2.** Dashboard ma własną powłokę `src/layouts/AppLayout.astro`: nagłówek z marką, nawigacją Main („Dashboard”, „Settings”) i jedynym „Sign out”, `<main>` o szerokości `max-w-5xl`, cicha linia „Signed in as” i stopka. Kolejność odpowiada głównej pętli: w grupie `<h1>` z nazwą grupy (eyebrow „Your group”), od 1024 px dwie kolumny (Tasks po lewej, trzy piąte; Leaderboard i Members z linkiem zaproszenia po prawej, dwie piąte), a na telefonie ta sama kolejność w jednej kolumnie. Wiersz tasku ma trzy linie: tytuł z etykietą „How often” i cichymi Edit/Delete twórcy, potem odznaczenie i streak, potem uczestnicy. Zarządzanie grupą jest w jednej karcie „Group settings” na osobnej stronie `/settings`, z akcją niebezpieczną na końcu (decyzje właściciela z 2026-10-12, niżej).
- **C2 (komponenty) — naprawiony w fazie 1, użyty w fazie 2.** `Badge`, `NativeSelect`, `CardTitle as`, `FormField`/`SubmitButton` w `src/components/forms/`; faza 2 dokłada `PageHeading` (jedyne miejsce typografii `<h1>`), wariant `warning` w `ui/alert.tsx` i `triggerVariant` w `ConfirmAction`.
- **C3 (tokeny) — wartości w fazie 1, użycie w fazie 2.** Stan „Done today” to `text-success` z ikoną `svg` i Undo; streak ma cyfrę `text-lg`; notki o częściowych awariach używają `--warning`.
- **C4 (błędy i stany) — naprawiony w fazie 2, bez zmiany kontraktu S-08.** Alert `?error=` jest pierwszy w `<main>`, a skrypt inline usuwa `error` z adresu (`history.replaceState`, inne parametry i hash zostają). `participantsFailed` i `checkoffsFailed` to ostrzeżenia `role="status"` nad listą, `tasksFailed` zamienia kartę Tasks na kartę z ostrzeżeniem. Nieudane ładowanie to strona z `<h1>` „The dashboard didn't load”, komunikatem i „Try again”, ze statusem 503 (G5). Oczekujące zaproszenie to jedna decyzja: `<h1>` „Join {group}?” z jedynym „Join group”, a tworzenie i dołączanie kodem pod „Or start your own group” (`JoinGroupForm` mówi „Join with code”).
- **C5 (reguły agenta) — naprawiony w fazie 1.** Sekcja `## UI` w `CLAUDE.md` i strażnik ESLint literałów w plikach widoku; faza 2 dopisuje `AppLayout` w Architecture.

Odroczone:

- **D1 — `Banner.astro`:** nie renderuje się na `/dashboard` (bez konfiguracji Supabase ścieżka chroniona przekierowuje przed renderem); należy do zmiany stron publicznych.
- **D2 — strona 503 przy awarii Auth** (`src/lib/auth-state.ts`): osobna, rzadka odpowiedź bez layoutu, poza „jednym widokiem”.
- **D3 — dark mode:** nic nie włącza `.dark`; blok dostał tylko wartości nowych tokenów, bez bramki.
- **D4 — obramowanie pól** (`--input` na `--card`, 1,25:1): pola mają wypełnienie i etykiety, to cecha presetu.
- **D5 — nieaktualna linia źródła w `global.css`:** naprawiona w fazie 1.
- **D6 — hover przycisku primary** (`hover:bg-primary/80`, 3,51:1): dotyczy każdej strony i nie jest parą, którą właściciel kazał poprawić.

Przekazania:

- **S-12 (`refactor-opportunities`):** krok ręczny 1.6 jego planu oczekuje statusu 200 z banerem „Something went wrong” przy nieudanym ładowaniu; po S-11 to 503 ze stroną błędu dashboardu. Notka jest pod kryterium w fazie 1 planu S-12 (`plan.md:110`); tytuł wiersza 1.6 w Progress zostaje. Linie wywołania `loadDashboard({...})` w `dashboard.astro` są bez zmian, więc dopisanie `log: requestFields(Astro)` da najwyżej konflikt jednej linii.
- **S-13 (siatka odznaczeń):** para tokenów stanu „odznaczone” to `--success`/`--success-foreground` (stan „Done …” w `CheckoffControl.tsx`: `text-success`, ikona `svg` i sam tekst etykiety w elemencie). Smoke wiąże wiersz tasku helperami `taskRowWithBadge`, `taskRowWithCheckoffForm`, `taskRowWithStatus`, `taskRowStreak`, `taskRowListing` i `leaderboardRow`: jeden `<li>` na task bez zagnieżdżonych `<li>`, tytuł pierwszy, `<span>Streak</span>` tuż przed `<span>N</span>`, e-mail uczestnika tuż przed etykietą „You”. Struktura wiersza (`TaskRow.astro`): linia 1 tytuł i etykieta „How often” (dla twórcy w `EditTaskForm`) z Edit/Delete, linia 2 `CheckoffControl`, linia 3 uczestnicy z Join/Leave.

### Decyzje właściciela po przeglądzie ręcznym fazy 2 (2026-10-12)

- **Ustawienia grupy na osobnej stronie.** Karta „Group settings” opuszcza dashboard i jest na nowej chronionej stronie `/settings` (`src/pages/settings.astro`, widok `SettingsView.astro`, loader `loadSettings` w `src/lib/settings-data.ts`, który czyta tylko grupę i przy błędzie raportuje `settings.load.failed`; strona odpowiada wtedy 503). Właściciel ma tam Rename group, a na końcu Delete group; członek ma Leave group; bez grupy strona odsyła linkiem na `/dashboard`. Prawa kolumna dashboardu to teraz Leaderboard, potem Members z linkiem zaproszenia.
- **Kontrakt S-08 bez zmian.** Rename, delete i leave nadal przekierowują na `/dashboard`; właściciel zaakceptował, że ich alert `?error=` pokazuje się na dashboardzie, nie na `/settings`.
- **Nawigacja.** Nagłówek stron zalogowanych ma obok marki linki „Dashboard” i „Settings” (`<nav aria-label="Main">`, `aria-current="page"` na bieżącej stronie), a „Sign out” po prawej. Na telefonie napis marki jest ukryty wizualnie (`sr-only sm:not-sr-only`), ale zostaje w HTML, więc nazwa linku i `BRAND_LINK` w smoke się nie zmieniają.
- **Szersza kolumna tablicy wyników.** Siatka od 1024 px ma pięć kolumn: Tasks trzy, prawa kolumna dwie.
- **Co to zmienia w planie** (`plan.md` zostaje bez zmian, zmiany zapisane tutaj):
  - decyzja właściciela 1 (układ desktopu): prawa kolumna to Leaderboard i Members, bez Group settings, w proporcji 3:2 zamiast około dwóch trzecich;
  - decyzja właściciela 10 (waga zarządzania): jedna karta „Group settings” jest na `/settings`, nie na końcu prawej kolumny dashboardu;
  - kontrola ręczna 2.12 (kolejność układu): na dashboardzie Tasks, potem Leaderboard i Members z linkiem zaproszenia; Group settings sprawdza się na `/settings`;
  - macierz 7 stanów: komórki „KS owner/member” przycisków niszczących (Delete group, Leave group, potwierdzenia w dialogu) to teraz stany `settings-owner` i `settings-member`, a zrzuty `rename-group`, `delete-group`, `leave-group` i dialogów pochodzą z tych stanów; nowy zrzut `nav-link` pokrywa hover i focus linków Main nav;
  - kontrola ręczna 2.13 (503) obejmuje też `/settings`. Wynik z przeglądu implementacji fazy 2 (F5, 2026-10-12), na podglądzie produkcyjnym:
    - przy zatrzymanym PostgREST zalogowany właściciel dostał 503 ze stroną „Settings didn't load” i „Try again”, a w logu raport `settings.load.failed`;
    - `/dashboard` w tym samym czasie odpowiedział 503;
    - po starcie kontenera „Try again” załadował stronę;
  - tabela sformułowań, wiersz „Participants failed” (decyzja z przeglądu implementacji fazy 2, F6, 2026-10-12): bez uczestników loader nie liczy tablicy wyników, więc znikają „Mark done” i Leaderboard. Komunikat mówi to teraz tak jak ten o odznaczeniach: „Participants are unavailable right now, so tasks can't be marked done and the leaderboard is hidden. Reload to try again.” (zamiast „unchanged text”).
- **Polityka prywatności** nie mówi, na której stronie opuszcza się lub usuwa grupę, więc nie wymaga zmiany.

## Faza 3: wydanie (2026-10-12)

- **Kryterium 3.1** (przegląd fazy 3, F5): `gh` na tej maszynie to 2.4.0 i nie zna `gh run list --branch`. Zamiennik: `gh run list --workflow ci.yml --json databaseId,headBranch,headSha,conclusion` z filtrem `headBranch == "master"`, potem `gh run view <id>`.
