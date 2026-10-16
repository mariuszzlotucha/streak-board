# Zaległości projektu poza S-13

Stan z 2026-10-16, gałąź `docs/open-items-closeout`, oparty na `origin/master` (`ea4564a`). `[x]` oznacza wykonane (dowody w `context/changes/deployment/deployment-plan.md`, Phase 17). `[ ]` oznacza otwarte, a przy każdej pozycji powód i to, czego potrzeba, jest w `context/foundation/open-items-blocked.md`.

Poza tą listą: S-13 `checkoff-grid` to jedyny otwarty wycinek roadmapy (`context/foundation/roadmap.md`). Po jego zamknięciu M-2 jest spełniony, a roadmapa nie ma następnego kamienia milowego.

## 1. Ręczne sprawdzenia S-12

Wiersze nieodhaczone w `context/archive/2026-10-06-refactor-opportunities/plan.md`. Archiwum jest tylko do odczytu, więc wyniki zapisano w `deployment-plan.md` (Phase 17), tak jak dla S-10.

- [x] **1.6** Zatrzymać PostgREST i wczytać `/dashboard`: 503 z komunikatem o błędzie, jedna linia `dashboard.load.failed`, po restarcie 200. Odchylenie: 503 przyszło po 8,6 s, nie po ~60 s.
- [x] **2.6** Strażnik migracji na scratch branchach (nigdy nie wypychanych): sześć z siedmiu wariantów zgodnych z planem. Odchylenie: duplikat linii allowlisty w tej samej gałęzi przechodzi (exit 0), plan oczekiwał exit 1. Decyzja właściciela w pliku blokad.
- [x] **2.7** Zmiana identyfikatora w `src/types.ts` → `npm run types:check` kończy się kodem 1 z diffem; po przywróceniu 0.
- [ ] **2.8** Draft PR ze scratch brancha, który ma zaczerwienić `integration`. Wymaga zgody właściciela (plan). Patrz plik blokad.
- [x] **2.9** Przeczytanie README, `test-plan.md`, wpisu w `CLAUDE.md` i wpisu w `lessons.md`. Poprawiona data nagłówka `test-plan.md` (2026-10-15 → 2026-10-16).
- [x] **3.4** Cztery zmiany „zepsuj i przywróć" w testach tras: każda zaczerwieniła co najmniej jeden test.
- [x] **3.5** Pusty `src/pages/api/tasks/probe.ts`: strażnik pokrycia czerwony; po usunięciu zielony.
- [~] **3.6** Nazwy testów: czerwony wiersz nazywa trasę i przypadek; 42 z 150 nazw zaczyna się od kodu SQLSTATE. Decyzja o stylu w pliku blokad.
- [x] **4.5** Trzy zmiany po stronie TS (limit 81, NBSP, `"monthly"`): kontrakty w `tests/unit` czerwone; przywrócone.
- [ ] **4.6** Osłabienie `groups_name_length` w scratch migracji i `npx supabase db reset`. Wymaga zgody właściciela (plan).
- [x] **5.5** Lokalnie `revoke select, delete` na trzech tabelach: blok S-12 czerwony z dokładnym komunikatem; po ponownym zastosowaniu migracji 300 asercji zielonych i uprawnienia jak przed.
- [ ] **5.6** `npx supabase db reset && npm run test:rls && npm test`. Wymaga zgody właściciela (plan).
- [ ] **5.12** Odczyt Max rows na hostowanym projekcie. Po stronie właściciela, opcjonalne.

## 2. Pytania przed S-13

- [ ] **Q-08** (produkcja, właściciel): czy są wiersze tasków `weekly` z datą inną niż poniedziałek. Zapytanie w SQL editorze produkcyjnej bazy: `select count(*) from task_checkoffs c join tasks t on t.id = c.task_id where t.recurrence = 'weekly' and extract(isodow from c.period) <> 1;`. Źródło: `context/domain/01-domain-distillation.md` §5. Powód: S-13 pokaże okresy, więc takie wiersze mogą wyjść w siatce.

Sprawdzone i zamknięte (nie szukać ponownie):

- Q-07: na produkcji tylko kody długości 12 (`deployment-plan.md`, Phase 7).
- Q-05: członkowie grupy widzą nawzajem e-mail (`src/components/privacy/WhoCanSee.astro`).
- Q-09: usunięcie konta właściciela kasuje grupę z jej zadaniami (`src/components/privacy/AccountDeletion.astro`).

## 3. Decyzje właściciela i dokumenty

- [ ] **Q-03**: czy usunięty członek może wrócić tym samym linkiem (dziś może). Kodu zaproszenia nie da się zrotować, bo nie ma trasy rotacji. Źródło: `context/domain/01-domain-distillation.md` §5.
- [ ] **Q-06**: poziomy i taski indywidualne z PRD (`context/foundation/prd.md:20`, `:29`) zostają w produkcie (wtedy jako FR), czy znikają z dokumentu. Kod ich nie ma.
- [ ] **R-01 i R-07**: PRD mówi, że streak „nie zeruje się całkowicie" (`prd.md:97`), a reguła z S-04 (połowa w dół) zeruje streak 1. Sekcja `## Open Questions` nadal brzmi „None". Poprawka dokumentów wejdzie razem z S-13 (PRD, polityka prywatności, słownik).

## 4. Dług z przeglądów AI

Plan `code-review-evals` jest tylko w follow-upach, nie w roadmapie. Wymaga planu, bo dotyka bramki `ai-review`. Źródła: `context/archive/2026-10-14-ci-cd-code-review/follow-ups/review-fixes.md` i `context/archive/2026-10-13-tool-loop-agent/follow-ups/review-fixes.md` (F2).

- [ ] Podrobione znaczniki w diffie (`＜/diff＞`, homoglify, znaki zerowej szerokości) nie są neutralizowane.
- [ ] Wstrzyknięcia, które podbijają same wyniki (a nie werdykt), reguła werdyktu nie łapie.
- [ ] Plik z bajtem NUL: `git diff` pokazuje „Binary files differ", więc model nie widzi treści.
- [ ] Marker `<!-- ai-cr:summary -->` (`.github/workflows/review.yml:227`): komentarz `claude-review` zaczynający się od niego mógłby zostać przejęty przez `ai-review`.
- [ ] Demo `packages/code-reviewer/review-with-session.ts` woła `generate()` bez limitu diffu (`:22`, `:32`) i nie loguje zużycia.
- [ ] Testy logiki workflow (filtr jq, budowanie komentarza, reguły etykiet).

Odroczone świadomie, z wyzwalaczami w planach. Nie są zadaniami, dopóki wyzwalacz się nie pojawi:

- OPP-6, OPP-7 i OPP-8 z S-12 (info trace, szkielet tras, jeden klient Supabase na żądanie): wyzwalacze w sekcji „What We're NOT Doing" planu S-12, m.in. czternasta trasa danych.
- OPP-10 z S-12 (ochrona każdej `/api/*`): wyzwalacz to nowa rodzina `/api/*`.
- CODEOWNERS dla `.github/`: odroczone, bo repozytorium ma jednego właściciela (`ci-cd` follow-upy, „Deferred").

## 5. Porządki lokalne (poza repozytorium)

- [x] `git pull --ff-only`: lokalny `master` na `ea4564a`.
- [x] `git branch -d docs/post-s10-consistency`: gałąź była zmergowana i została usunięta.
- [x] `git fetch --tags --force`: lokalny tag `production` wskazuje `1e971f1`, tak jak zdalny.
- [ ] Dependabot alerts są wyłączone w repozytorium (API zwraca 403). Włączenie w Settings → Code security to decyzja właściciela.

## Sugerowana kolejność (aktualna)

1. Q-08 (kilka minut, właściciel).
2. Zgody na 2.8, 4.6 i 5.6, jeśli chcesz je przeprowadzić.
3. Decyzja o duplikatach w allowliście (2.6) i o stylu nazw testów (3.6).
4. S-13 razem z aktualizacją PRD (R-01, R-07).
5. `code-review-evals`: zaplanować albo odłożyć.
