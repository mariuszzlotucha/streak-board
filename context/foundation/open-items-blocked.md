# Zaległości, których nie udało się wykonać albo rozstrzygnąć

Stan z 2026-10-16, po scaleniu PR #146 (`68efab0`). Wykonane i rozstrzygnięte pozycje są w `open-items.md`, a odpowiedzi właściciela w `owner-decisions.md`. Tutaj zostało to, co nadal czeka: poprawki po decyzjach.

## Dlaczego to nie jest przebieg `/10x-goal-implement`

Skill pracuje nad zatwierdzonym `context/changes/<change-id>/plan.md`. `open-items.md` nim nie jest, więc tryb `/goal` nie mógł wystartować. CLAUDE.md mówi: „Deleguj wyłącznie zaplanowaną pracę. Brak zatwierdzonego plan.md oznacza brak działania bez nadzoru."

Pracę wykonałem bez Twojej interwencji, ale nie w trybie `/goal`. Zmiany były na osobnym branchu, a PR był bramką przeglądu. Niczego nie scaliłem ani nie wypchnąłem na `master`. Jeśli chcesz, żeby takie prace szły planem, potrzebny jest `/10x-plan` i zatwierdzenie.

## Do zrobienia po decyzjach

- **Poprawki dokumentów razem z S-13**: decyzje: reguła streaka stoi (1 → 0), poziomy i taski indywidualne znikają z PRD, okno dat `UTC−7 … UTC+1` jest znaną luką. Do poprawy: `context/foundation/prd.md` (`:20`, `:29`, `:97`, sekcja `## Open Questions` na `:116-118`), polityka prywatności (streak), słownik, opis okna dat.
- **Plan `code-review-evals`**: zamknięte 2026-10-17. Zaplanowany w `context/changes/code-review-evals/plan.md` (PR #158), zaimplementowany na gałęzi `code-review-evals/implementation`; punkty zakresu z odnośnikami są odhaczone w `open-items.md` §4.

## Odroczone z wyzwalaczami (nie są zadaniami)

- OPP-6, OPP-7, OPP-8 i OPP-10 z S-12: wyzwalacze są w sekcji „What We're NOT Doing" planu `context/archive/2026-10-06-refactor-opportunities/plan.md`, np. czternasta trasa danych albo nowa rodzina `/api/*`.
- CODEOWNERS dla `.github/`: decyzja 2026-10-16 to odroczyć, bo repozytorium ma jednego właściciela.

## Obserwacje z tego przebiegu (bez działań)

- Serwer deweloperski zalogował `Invalid hook call` i `TypeError: Cannot read properties of null (reading 'useContext')` z `lucide-react` w wyspie React, po `[vite] program reload`. Przed testem 1.6 była to już obecna linia logu. W czasie testu się nie powtórzyła. Dotyczy trybu dev; build produkcyjny nie był sprawdzany.
- Test 1.6: 503 przyszło po 8,6 s, a plan zakładał ok. 60 s. Gateway od razu zgłosił brak rozwiązania nazwy, gdy kontener PostgREST był zatrzymany.
