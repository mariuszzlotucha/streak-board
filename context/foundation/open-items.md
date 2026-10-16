# Zaległości projektu poza S-13

Stan z 2026-10-16, po scaleniu PR #146 (`68efab0`). Decyzje właściciela z tego dnia są w `context/foundation/owner-decisions.md`. `[x]` oznacza wykonane albo rozstrzygnięte, `[ ]` oznacza, że zostało do zrobienia. Powody i szczegóły przy punktach, które czekają, są w `context/foundation/open-items-blocked.md`.

Poza tą listą: otwarty wycinek roadmapy (`context/foundation/roadmap.md`) to S-13 `checkoff-grid`. S-14 `nickname` wydany 2026-10-16 w dwóch wydaniach (`deployment-plan.md`, Phase 18), zostało jego archiwum (`/10x-archive nickname`). Decyzja właściciela z 2026-10-16: S-14 wchodzi do „Done when” M-2, więc M-2 jest spełniony po zamknięciu S-13, a roadmapa nie ma następnego kamienia milowego.

## 1. Ręczne sprawdzenia S-12

Wiersze nieodhaczone w `context/archive/2026-10-06-refactor-opportunities/plan.md`. Archiwum jest tylko do odczytu, więc wyniki zapisano w `deployment-plan.md` (Phase 17), tak jak dla S-10.

- [x] **1.6** Zatrzymać PostgREST i wczytać `/dashboard`: 503 z komunikatem o błędzie, jedna linia `dashboard.load.failed`, po restarcie 200. Odchylenie: 503 przyszło po 8,6 s, nie po ~60 s.
- [x] **2.6** Strażnik migracji na scratch branchach (nigdy nie wypychanych): sześć z siedmiu wariantów zgodnych z planem. Odchylenie: duplikat linii allowlisty w tej samej gałęzi przechodził (exit 0), plan oczekiwał exit 1. Decyzja właściciela: blokować. Poprawka zrobiona 2026-10-16 w `scripts/migration-guard.mjs`; kontrola na scratch branchu: dwie identyczne linie exit 1, jedna exit 0.
- [x] **2.7** Zmiana identyfikatora w `src/types.ts` → `npm run types:check` kończy się kodem 1 z diffem; po przywróceniu 0.
- [ ] **2.8** Draft PR ze scratch brancha, który ma zaczerwienić `integration`. Decyzja 2026-10-16: pomijamy, blokada merge'a zostaje niesprawdzona.
- [x] **2.9** Przeczytanie README, `test-plan.md`, wpisu w `CLAUDE.md` i wpisu w `lessons.md`. Poprawiona data nagłówka `test-plan.md` (2026-10-15 → 2026-10-16).
- [x] **3.4** Cztery zmiany „zepsuj i przywróć" w testach tras: każda zaczerwieniła co najmniej jeden test.
- [x] **3.5** Pusty `src/pages/api/tasks/probe.ts`: strażnik pokrycia czerwony; po usunięciu zielony.
- [x] **3.6** Nazwy testów: czerwony wiersz nazywa trasę i przypadek; 42 z 150 nazw zaczynało się od kodu SQLSTATE. Decyzja 2026-10-16: zmienić na zdania. Zrobione 2026-10-16 w `tests/integration/data-routes.test.ts`: nazwy opisują przypadek, kody zostają w asercjach.
- [x] **4.5** Trzy zmiany po stronie TS (limit 81, NBSP, `"monthly"`): kontrakty w `tests/unit` czerwone; przywrócone.
- [x] **4.6** Osłabienie `groups_name_length` do 81 w scratch migracji (zgoda właściciela, 2026-10-16): `npm test` czerwony, 9 nieudanych testów w `tests/integration/rule-contracts.test.ts`. Część to kaskada: `cleanupUsers` nie usunął konta, bo grupa o 81 znakach nie została posprzątana (`owner_id … on delete restrict`, komentarz w `tests/integration/rule-contracts.test.ts:22-24`). Kolejne testy zgłosiły `group_members_user_id_key`. Po przywróceniu limitu 80 (`db reset`) wszystko zielone. Scratch migracja usunięta.
- [x] **5.5** Lokalnie `revoke select, delete` na trzech tabelach: blok S-12 czerwony z dokładnym komunikatem; po ponownym zastosowaniu migracji 300 asercji zielonych i uprawnienia jak przed.
- [x] **5.6** `npx supabase db reset && npm run test:rls && npm test` (zgoda właściciela, 2026-10-16): RLS 300 asercji zielonych, `npm test` 40 plików, 743 testy, wszystkie zielone.
- [ ] **5.12** Odczyt Max rows na hostowanym projekcie. Decyzja 2026-10-16: pomijamy, punkt jest opcjonalny.

## 2. Dane produkcyjne

- [x] **Q-08** (produkcja): wynik 0, czyli żaden wiersz `weekly` nie ma daty innej niż poniedziałek. Wynik podał właściciel, ja nie sprawdzałem produkcji. Zapytanie: `select count(*) from task_checkoffs c join tasks t on t.id = c.task_id where t.recurrence = 'weekly' and extract(isodow from c.period) <> 1;`. Źródło: `context/domain/01-domain-distillation.md` §5.

Sprawdzone i zamknięte (nie szukać ponownie):

- Q-07: na produkcji tylko kody długości 12 (`deployment-plan.md`, Phase 7).
- Q-05: rozstrzygnięte 2026-10-16: członkowie grupy widzą nawzajem nick, nie e-mail (S-14 `nickname`; wydanie 1 o 15:53 UTC, wydanie 2 o 16:22:56 UTC usunęło e-mail z `list_group_members`; `deployment-plan.md`, Phase 18; `src/components/privacy/WhoCanSee.astro`).
- Q-09: usunięcie konta właściciela kasuje grupę z jej zadaniami (`src/components/privacy/AccountDeletion.astro`).

## 3. Decyzje właściciela (2026-10-16)

Szczegóły i źródła są w `context/foundation/owner-decisions.md`.

- [x] **Q-01 / R-01 / R-07**: reguła spadku stoi, pominięty okres dzieli streak w dół (1 → 0). Dokumenty do poprawy: patrz punkt niżej.
- [x] **Q-02**: osierocone taski zostają jak dziś, czyli nikt nie edytuje ani nie usuwa ich do powrotu twórcy.
- [x] **Q-03**: usunięty członek może wrócić tym samym linkiem, jak dziś. Kod zaproszenia zostaje bez rotacji.
- [x] **Q-04**: okno dat `UTC−7 … UTC+1` w `task_checkoffs` to akceptowana luka zaufania. Kod bez zmian.
- [x] **Q-06**: poziomy i taski indywidualne znikają z PRD, bo kodu ich nie ma.
- [ ] **Poprawki dokumentów razem z S-13**: PRD (streak `prd.md:97`, sekcja `## Open Questions` `:116-118`, poziomy i taski indywidualne `:20`, `:29`), polityka prywatności (streak), słownik, opis okna dat jako znanej luki (Q-04).

## 4. Dług z przeglądów AI

Plan `code-review-evals` jest tylko w follow-upach, nie w roadmapie. Wymaga planu, bo dotyka bramki `ai-review`. Decyzja 2026-10-16: zaplanować całość przez `/10x-plan`. Źródła: `context/archive/2026-10-14-ci-cd-code-review/follow-ups/review-fixes.md` i `context/archive/2026-10-13-tool-loop-agent/follow-ups/review-fixes.md` (F2).

- [ ] Zaplanować `code-review-evals` przez `/10x-plan`. Zakres:
- [ ] Podrobione znaczniki w diffie (`＜/diff＞`, homoglify, znaki zerowej szerokości) nie są neutralizowane.
- [ ] Wstrzyknięcia, które podbijają same wyniki (a nie werdykt), reguła werdyktu nie łapie.
- [ ] Plik z bajtem NUL: `git diff` pokazuje „Binary files differ", więc model nie widzi treści.
- [ ] Marker `<!-- ai-cr:summary -->` (`.github/workflows/review.yml:227`): komentarz `claude-review` zaczynający się od niego mógłby zostać przejęty przez `ai-review`.
- [ ] Demo `packages/code-reviewer/review-with-session.ts` woła `generate()` bez limitu diffu (`:22`, `:32`) i nie loguje zużycia.
- [ ] Testy logiki workflow (filtr jq, budowanie komentarza, reguły etykiet).

Odroczone świadomie, z wyzwalaczami w planach. Nie są zadaniami, dopóki wyzwalacz się nie pojawi:

- OPP-6, OPP-7 i OPP-8 z S-12 (info trace, szkielet tras, jeden klient Supabase na żądanie): wyzwalacze w sekcji „What We're NOT Doing" planu S-12, m.in. czternasta trasa danych. Ten wyzwalacz zapalił się 2026-10-16: S-14 dodał czternastą trasę danych `POST /api/account/nickname` (strażnik pokrycia w `tests/integration/data-routes.test.ts` liczy 14 plików). Czy otworzyć zmianę, decyduje właściciel.
- OPP-10 z S-12 (ochrona każdej `/api/*`): wyzwalacz to nowa rodzina `/api/*`. Wyzwalacz zapala S-14 (`/api/account`, plan z 2026-10-16); plan S-14 dopisuje rodzinę do `PROTECTED_ROUTES` i zostawia OPP-10 jako osobną zmianę, bo zmienia odpowiedź nieznanych ścieżek `/api/*` z 404 na 302.
- CODEOWNERS dla `.github/`: decyzja 2026-10-16 to odroczyć, bo repozytorium ma jednego właściciela.
- S-14 `nickname`, dwie rzeczy poza zakresem: (1) baza nie wymusza, że członek grupy ma nick, więc bezpośrednie wywołanie `join_group` przez PostgREST własnym tokenem dodaje członka widocznego jako „Unknown member” (sekcja „What We're NOT Doing” planu, `context/changes/nickname/plan.md`); (2) nicki z łudząco podobnych liter (np. cyrylickie „а”) są dozwolone, bo nie ma kontroli confusables (przegląd fazy 1, F3). Wyzwalacz: „Unknown member” w grupie, której wszyscy członkowie logowali się po 2026-10-16, albo zgłoszony nick podszywający się pod innego członka.

## 5. Porządki lokalne i ustawienia repozytorium

- [x] `git pull --ff-only`: lokalny `master` na `ea4564a`, a potem na `68efab0`.
- [x] `git branch -d docs/post-s10-consistency`: gałąź była zmergowana i została usunięta.
- [x] `git fetch --tags --force`: lokalny tag `production` wskazuje `1e971f1`, tak jak zdalny.
- [x] Dependabot alerts: włączone 2026-10-16 przez API (`PUT …/vulnerability-alerts` zwróciło 204, odczyt też 204).

## Sugerowana kolejność (aktualna)

1. S-14 `nickname`: oba wydania są na produkcji; zostało `/10x-archive nickname`.
2. S-13 `checkoff-grid` (`/10x-frame`), razem z poprawkami dokumentów (streak, poziomy, okno dat).
3. `/10x-plan` dla `code-review-evals`.
