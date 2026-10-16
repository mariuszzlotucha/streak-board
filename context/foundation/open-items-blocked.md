# Zaległości, których nie udało się wykonać

Stan z 2026-10-16, gałąź `docs/open-items-closeout`, oparty na `origin/master` (`ea4564a`). Wykonane pozycje są w `open-items.md` i w `context/changes/deployment/deployment-plan.md` (Phase 17). Tutaj są te, które wymagają właściciela, zgody albo planu.

## Dlaczego to nie jest przebieg `/10x-goal-implement`

Skill pracuje nad zatwierdzonym `context/changes/<change-id>/plan.md`. `open-items.md` nim nie jest, więc tryb `/goal` nie mógł wystartować. CLAUDE.md mówi: „Deleguj wyłącznie zaplanowaną pracę. Brak zatwierdzonego plan.md oznacza brak działania bez nadzoru."

Pracę wykonałem bez Twojej interwencji, ale nie w trybie `/goal`. Zmiany są na osobnym branchu. Niczego nie scaliłem ani nie wypchnąłem na `master`, a PR jest bramką przeglądu. Jeśli chcesz, żeby takie prace szły planem, potrzebny jest `/10x-plan` i zatwierdzenie.

## Wymaga zgody właściciela

- **2.8**: draft PR z celowo czerwonym `integration`. Plan wymaga zgody, a PR uruchamia CI i bota recenzenta.
- **4.6** i **5.6**: `npx supabase db reset` na lokalnej bazie. Plan wymaga zgody, a reset kasuje lokalne dane.

## Wymaga właściciela (decyzja albo dostęp do produkcji)

- **Q-08** (produkcja): wiersze `weekly` z datą inną niż poniedziałek. Zapytanie w SQL editorze produkcyjnej bazy:

  ```sql
  select count(*) from task_checkoffs c join tasks t on t.id = c.task_id where t.recurrence = 'weekly' and extract(isodow from c.period) <> 1;
  ```

  Najlepiej przed S-13, bo siatka pokaże okresy. Źródło: `context/domain/01-domain-distillation.md` §5.

- **5.12** (opcjonalne): odczyt Project Settings → API → Max rows na hostowanym projekcie.
- **Q-03**: czy usunięty członek może wrócić tym samym linkiem. Dziś może, a kodu zaproszenia nie da się zrotować, bo nie ma trasy rotacji.
- **Q-06**: poziomy i taski indywidualne z PRD (`context/foundation/prd.md:20`, `:29`) zostają w produkcie jako FR, czy znikają z dokumentu. Kod ich nie ma.
- **R-01 i R-07**: PRD mówi, że streak „nie zeruje się całkowicie" (`prd.md:97`), a reguła z S-04 (połowa w dół) zeruje streak 1. Sekcja `## Open Questions` nadal brzmi „None". Poprawka dokumentów wejdzie razem z S-13.
- **Duplikaty w allowliście (2.6)**: czy linia powtórzona w tej samej gałęzi ma blokować strażnika migracji. Teraz nie blokuje (exit 0, dwa ostrzeżenia), a plan oczekiwał exit 1. Wariantu „linia już w bazie" nie da się odtworzyć, dopóki `origin/master` nie ma pliku `supabase/checks/migration-edit-allowlist.txt`.
- **Styl nazw testów (3.6)**: 42 z 150 nazw w `tests/integration/data-routes.test.ts` zaczyna się od kodu SQLSTATE lub `XX000`, np. `42501: forbidden with an error line carrying the status`. Czy zmienić je na zdania.
- **Dependabot alerts**: wyłączone w repozytorium (API zwraca 403). Włączenie w Settings → Code security.
- **CODEOWNERS dla `.github/`**: odroczone w follow-upach ci-cd. Decyzja, czy repozytorium go potrzebuje.

## Wymaga planu (`/10x-plan`), nie robię tego bez zatwierdzonego planu

`code-review-evals`, czyli utwardzenie AI-recenzenta (`ai-review` jest wymaganym checkiem). Zmiany dotykają bramki, więc potrzebują planu i ewaluacji:

- podrobione znaczniki w diffie (`＜/diff＞`, homoglify, znaki zerowej szerokości) nie są neutralizowane (`context/archive/2026-10-14-ci-cd-code-review/follow-ups/review-fixes.md`);
- wstrzyknięcia, które podbijają same wyniki, a nie werdykt, reguła werdyktu nie łapie;
- plik z bajtem NUL: `git diff` pokazuje „Binary files differ", więc model nie widzi treści;
- marker `<!-- ai-cr:summary -->` (`.github/workflows/review.yml:227`) może przejąć komentarz `claude-review`;
- demo `packages/code-reviewer/review-with-session.ts` woła `generate()` bez limitu diffu (`:22`, `:32`) i nie loguje zużycia (`context/archive/2026-10-13-tool-loop-agent/follow-ups/review-fixes.md`, F2);
- brak testów logiki workflow (filtr jq, budowanie komentarza, reguły etykiet).

## Odroczone z wyzwalaczami (nie są zadaniami)

- OPP-6, OPP-7, OPP-8 i OPP-10 z S-12: wyzwalacze są w sekcji „What We're NOT Doing" planu `context/archive/2026-10-06-refactor-opportunities/plan.md`, np. czternasta trasa danych albo nowa rodzina `/api/*`.

## Obserwacje z tego przebiegu (bez działań)

- Serwer deweloperski zalogował `Invalid hook call` i `TypeError: Cannot read properties of null (reading 'useContext')` z `lucide-react` w wyspie React, po `[vite] program reload`. Przed testem 1.6 była to już obecna linia logu. W czasie testu się nie powtórzyła. Dotyczy trybu dev; build produkcyjny nie był sprawdzany.
- Test 1.6: 503 przyszło po 8,6 s, a plan zakładał ok. 60 s. Gateway od razu zgłosił brak rozwiązania nazwy, gdy kontener PostgREST był zatrzymany.
