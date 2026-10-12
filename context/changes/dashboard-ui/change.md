---
change_id: dashboard-ui
title: Dashboard ui
status: plan_reviewed
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
