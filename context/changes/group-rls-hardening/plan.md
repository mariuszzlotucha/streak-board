# Utwardzenie RLS grup (group-rls-hardening) — Plan implementacji

## Overview

Domykamy luki w RLS wykryte przez `/code-review` migracji F-01 (`supabase/migrations/20260925003350_create_groups_and_group_members.sql`, commit `9efb772`). Zmiana to jedna **nowa** migracja (stara jest już zarchiwizowana i zostaje bez zmian) plus regeneracja `src/types.ts` oraz powtarzalny skrypt scenariuszy RLS. Najważniejsza decyzja: walidacja `join_code` przenosi się do funkcji `join_group(p_join_code)` — tym samym część FR-002 z S-01 zostaje dostarczona wcześniej, a bezpośredni INSERT do `group_members` przestaje być możliwy.

## Current State Analysis

Ustalenia z review zostały odtworzone na lokalnej bazie (transakcje z rollbackiem, Supabase w Dockerze) — stan sprzed tej zmiany:

- **Potwierdzone (#2)**: właściciel grupy A usuwa własne członkostwo (`DELETE 1`), po czym dołącza do grupy B i widzi obie grupy — guardrail „jedna grupa na użytkownika" jest złamany (`supabase/migrations/20260925003350_create_groups_and_group_members.sql:112-121`).
- **Potwierdzone (#3)**: zwykły członek nie może opuścić grupy — `DELETE` zwraca 0 wierszy, a `UNIQUE(user_id)` uniemożliwia przejście do innej grupy.
- **Potwierdzone (#4)**: `INSERT ... RETURNING` na `group_members` kończy się „new row violates row-level security policy" (SELECT przez `is_group_member()` nie widzi wiersza z tego samego zapytania, `:103-106`); zwykły INSERT przechodzi.
- **Potwierdzone (#5)**: `is_group_member(p_group_id, p_user_id)` (`SECURITY DEFINER`, `:36-52`) jest wywoływalne przez RPC z dowolnymi argumentami i zwraca członkostwo cudzego użytkownika.
- **Świadomie odłożone w F-01, teraz podjęte** (`context/archive/2026-09-25-group-schema-and-rls/plan.md:37,40-41`): brak walidacji `join_code` przy dołączaniu (#1; F-01 zakładał, że UUID grupy nie jest ujawniany nie-członkom), brak self-leave-group (#3), krótki `join_code` (#7).
- **Nieodtwarzane, ale oczywiste z kodu**: gołe `auth.uid()` w politykach (#6, `:88-121`), brak `CHECK` na `groups.name` (#7, `:16`), UPDATE/INSERT na `groups` bez ograniczenia kolumn — właściciel może ustawić `join_code` i `id` (#8, `:94-97`).
- Żaden kod aplikacji nie używa jeszcze tych tabel: `grep` po `src/` trafia wyłącznie w wygenerowany `src/types.ts`. Zmiana sygnatury funkcji i usunięcie polityki INSERT nie psują więc żadnego wywołania.
- `eslint.config.js` już ignoruje `src/types.ts` (F-01), a `npx supabase db reset --version <ts>` pozwala zresetować bazę do wskazanej migracji (potrzebne w fazie 2).
- Aplikacja jest wdrożona produkcyjnie bez stagingu (`context/changes/deployment/deployment-plan.md`); wypchnięcie migracji na produkcję pozostaje poza zakresem, jak w F-01.

### Key Discoveries:

- Prototyp całej migracji uruchomiony w transakcji z rollbackiem przeszedł wszystkie scenariusze (join z dobrym/złym kodem, ponowny join, self-leave, właściciel nie usuwa siebie, właściciel usuwa członka, nie-członek nie usuwa nikogo, kolumny, `CHECK`, `anon` bez dostępu do RPC). Kolejność operacji, która działa: drop polityk zależnych od funkcji → drop starej funkcji → create nowych funkcji → create polityk.
- Uprawnienia kolumnowe (`grant insert (owner_id, name)`, `grant update (name)`) współpracują z `INSERT ... RETURNING` na `groups`. Pułapka wykryta w prototypie: INSERT z jawnym `id` jest odrzucany („permission denied for table groups") — klient musi wysyłać wyłącznie `name` i `owner_id`.
- `REVOKE EXECUTE` od `authenticated` nie zamknie wyroczni z #5, bo polityki RLS wywołują funkcję z uprawnieniami użytkownika; zamyka ją dopiero wersja jednoargumentowa czytająca `auth.uid()` wewnątrz.
- Po przeniesieniu dołączania do `join_group()` kod staje się jedyną bramką do grupy, a RPC pozwala zgadywać go bez limitu — dlatego domyślny `join_code` rośnie z 8 do 12 znaków hex (48 bitów).

## Desired End State

Po tym planie, na lokalnej bazie:

- Do grupy można dołączyć wyłącznie przez `join_group(p_join_code)`; bezpośredni INSERT do `group_members` jest odrzucany. Zły kod → błąd `P0002`; użytkownik już należący do grupy → `unique_violation` (`23505`).
- Właściciel nie może usunąć własnego wiersza w `group_members` (opuszcza grupę wyłącznie przez jej usunięcie); zwykły członek może usunąć własny wiersz (wyjść z grupy); właściciel usuwa innych członków jak dotąd.
- `is_group_member(p_group_id)` odpowiada tylko o członkostwo wywołującego — koniec wyroczni.
- Klient może wstawić do `groups` tylko `name` i `owner_id`, a zaktualizować wyłącznie `name`; `name` ma 1–80 znaków po `btrim`; nowe `join_code` ma 12 znaków.
- Wszystkie polityki używają `(select auth.uid())`.
- `src/types.ts` odzwierciedla nowy schemat (`join_group`, jednoargumentowe `is_group_member`), a `supabase/checks/rls-scenarios.sql` powtarzalnie weryfikuje powyższe (kod wyjścia ≠ 0 przy regresji).

Weryfikacja: kryteria sukcesu w fazach 1 i 2.

## What We're NOT Doing

- Edycja istniejącej migracji `20260925003350_...` — migracje są niezmienne; wszystko idzie do nowej.
- Endpointy API/UI dołączania i zarządzania grupą (S-01). Ta zmiana dostarcza tylko funkcję `join_group` po stronie bazy; S-01 woła ją przez `.rpc('join_group', ...)`.
- Rate limiting wywołań `join_group` — brak takiego mechanizmu w bazie; ryzyko ograniczamy długością kodu (48 bitów) i akceptujemy.
- Retry przy kolizji `join_code` — przy 48 bitach i skali „grono znajomych" pomijalne (decyzja F-01 podtrzymana).
- Rotacja, wygasanie i wiele kodów na grupę; zmiana `join_code` istniejących grup (nowa domyślna długość dotyczy tylko nowo tworzonych grup; istniejące kody zostają).
- Normalizacja kodu (trim, wielkość liter) — `join_group` porównuje dokładnie; ewentualną normalizację robi S-01.
- Transfer własności grupy — właściciel opuszcza grupę tylko przez jej usunięcie (kaskada usuwa `group_members`).
- Pgtap i podpięcie skryptu scenariuszy do CI — skrypt uruchamia się ręcznie (`docker exec ... psql`).
- Zastosowanie migracji na produkcji — osobny, świadomy krok po zielonej weryfikacji lokalnej.

## Implementation Approach

Faza 1 dostarcza jedną migrację (funkcje, polityki, uprawnienia kolumnowe, `CHECK`, domyślny `join_code`) i regenerację typów, zweryfikowane `db reset` + lint + build + krótką kontrolą ręczną. Faza 2 dodaje skrypt scenariuszy z asercjami, który zamienia ręczną checklistę F-01 w powtarzalną, oraz dowodzi, że skrypt naprawdę wykrywa regresje (po celowym odtworzeniu starej polityki INSERT skrypt musi się nie powieść). Prototyp migracji został już zweryfikowany w transakcji z rollbackiem, więc faza 1 to przede wszystkim przeniesienie go do pliku migracji.

## Critical Implementation Details

- **Kolejność w migracji jest wymuszona zależnościami**: polityki `groups_select_own_group` i `group_members_select_own_group` zależą od starej `is_group_member(uuid, uuid)`, więc przed `drop function` trzeba je usunąć (razem z `group_members_insert_self` i `group_members_delete_by_group_owner`, które i tak są zastępowane); dopiero po utworzeniu nowych funkcji tworzy się polityki od nowa. Polityki, których treść tylko zmienia `auth.uid()` na `(select auth.uid())` (`groups_insert_as_owner`, `groups_update_by_owner`, `groups_delete_by_owner`), można zmienić przez `alter policy`.
- **Uprawnienia kolumnowe na `groups`**: `revoke insert, update on public.groups from authenticated`, następnie `grant insert (owner_id, name)` i `grant update (name)`. Kolumny bez uprawnienia (`id`, `join_code`, `created_at`) dostają wartości domyślne; klient (S-01) nie może ich podawać w INSERT. `SELECT` pozostaje bez zmian.
- **`join_group` jako `SECURITY DEFINER`**: `set search_path = ''`, w pełni kwalifikowane nazwy, `revoke execute ... from public, anon`, `grant execute ... to authenticated`. Zwraca wyłącznie `id` grupy. Rozróżnienie `P0002` (zły kod) od `23505` (dobry kod, ale użytkownik już w grupie) pozwala sprawdzać ważność kodów bez dołączania — akceptujemy to i ograniczamy wyłącznie entropią kodu (48 bitów, brak rate limitu; patrz „What We're NOT Doing").
- **Kaskady omijają RLS**: usunięcie grupy przez właściciela kasuje jej `group_members` mimo braku polityki DELETE dla jego własnego wiersza; trigger `add_owner_to_group` (`SECURITY DEFINER`) nadal działa mimo usunięcia polityki INSERT na `group_members`.

## Phase 1: Migracja utwardzająca + regeneracja typów

### Overview

Jedna nowa migracja domykająca #1–#8 z review oraz odświeżony `src/types.ts`.

### Changes Required:

#### 1. Migracja utwardzająca RLS

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_harden_group_rls.sql` (znacznik czasu z chwili implementacji, późniejszy niż `20260925003350`; konwencja CLAUDE.md)

**Intent**: Zamknąć luki z review F-01 bez edycji starej migracji: usunąć możliwość dołączenia do grupy bez kodu, naprawić inwarianty członkostwa (właściciel zawsze w grupie, członek może wyjść), zlikwidować wyrocznię członkostwa i ograniczyć, co klient może zapisać w `groups`.

**Contract**:
- Funkcje:
  - `public.is_group_member(p_group_id uuid) returns boolean` — `stable security definer`, `set search_path = ''`, sprawdza członkostwo `(select auth.uid())` w `group_members`; `revoke execute ... from public, anon`, `grant execute ... to authenticated`. Stara `is_group_member(uuid, uuid)` zostaje usunięta.
  - `public.join_group(p_join_code text) returns uuid` — `security definer`, `set search_path = ''`; znajduje `groups.id` po `join_code` (dokładne porównanie), przy braku dopasowania `raise exception 'invalid join code' using errcode = 'P0002'`; wstawia `(group_id, (select auth.uid()))` do `group_members`; zwraca `group_id`. Naruszenie `UNIQUE(user_id)` (użytkownik już w grupie) propaguje się jako `23505`. `revoke execute ... from public, anon`, `grant execute ... to authenticated`.
- `groups`:
  - `check (char_length(btrim(name)) between 1 and 80)` (nazwa `groups_name_length`).
  - **Addendum (po `/10x-impl-review` fazy 1, F1):** zaimplementowany warunek to `char_length(btrim(name, E' \t\r\n')) between 1 and 80` — domyślny `btrim` obcina tylko spacje i przepuszczał nazwy z samych tabulatorów/nowych linii. Zob. `reviews/impl-review-phase-1.md`, commit `a548bdb`.
  - Domyślny `join_code`: `substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)`; istniejące wiersze bez zmian.
  - Uprawnienia kolumnowe: INSERT tylko `(owner_id, name)`, UPDATE tylko `(name)` (patrz Critical Implementation Details).
- Polityki (wszystkie `to authenticated`, `auth.uid()` zawsze jako `(select auth.uid())`):
  - `groups` SELECT: `owner_id = (select auth.uid()) or public.is_group_member(id)`.
  - `groups` INSERT/UPDATE/DELETE: bez zmiany semantyki (`owner_id = (select auth.uid())`).
  - `group_members` SELECT: `public.is_group_member(group_id)`.
  - `group_members` INSERT: **brak polityki** (domyślna odmowa) — dołączanie wyłącznie przez `join_group`.
  - `group_members` DELETE, właściciel: `user_id <> (select auth.uid())` i istnieje grupa `g` z `g.id = group_id` oraz `g.owner_id = (select auth.uid())` (nazwa `group_members_delete_by_group_owner`, treść zmieniona — właściciel nie usuwa własnego wiersza).
  - `group_members` DELETE, własny wiersz (nowa `group_members_delete_self`): `user_id = (select auth.uid())` i nie istnieje grupa `g` z `g.id = group_id` oraz `g.owner_id = user_id` (właściciel nie może opuścić własnej grupy).
  - Brak polityki UPDATE na `group_members` (jak w F-01).
- Nagłówek migracji odsyła do review F-01 (commit `9efb772`) i wymienia zamknięte punkty.

#### 2. Wygenerowane typy Supabase

**File**: `src/types.ts`

**Intent**: Odzwierciedlić zmieniony schemat — jednoargumentowe `is_group_member` i nowe `join_group` — dla S-01.

**Contract**: Regeneracja poleceniem z F-01 po zastosowaniu migracji lokalnie: `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`. Plik jest w całości generowany; nie edytować ręcznie.

### Success Criteria:

#### Automated Verification:

- Obie migracje stosują się od zera bez błędów: `npx supabase db reset`
- Typy generują się i zawierają nową funkcję: `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts && grep -q join_group src/types.ts`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Szybka kontrola trzech kluczowych zachowań lokalnie jako użytkownik `authenticated` (SQL z `set local role authenticated` i `request.jwt.claims`): `join_group` z dobrym kodem dołącza, ze złym kodem rzuca `P0002`; bezpośredni `INSERT` do `group_members` jest odrzucony przez RLS; właściciel nie usunie własnego wiersza w `group_members` (`DELETE 0`).

**Implementation Note**: Po ukończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2. Bloki faz używają zwykłych wypunktowań — checkboxy stanu żyją w `## Progress` na dole planu.

---

## Phase 2: Skrypt scenariuszy RLS

### Overview

Powtarzalny skrypt SQL z asercjami, który pokrywa scenariusze F-01 oraz wszystkie zamknięte tu luki, uruchamiany na lokalnej bazie i kończący się niezerowym kodem przy regresji.

### Changes Required:

#### 1. Skrypt scenariuszy z asercjami

**File**: `supabase/checks/rls-scenarios.sql` (katalog `supabase/checks/`, nie `supabase/tests/` — `supabase test db` traktuje ten drugi jako pgTAP i uruchomiłby plik)

**Intent**: Zamienić ręczną checklistę RLS z F-01 w powtarzalny, obiektywny test: każdy scenariusz kończy się jawnym PASS albo wyjątkiem, a całość jest wykonywana w transakcji, która zawsze się wycofuje, więc lokalna baza pozostaje nietknięta.

**Contract**: Uruchamiany poleceniem `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql` (nazwa kontenera z `project_id` w `supabase/config.toml`). Tworzy trzech użytkowników testowych w `auth.users`, przełącza rolę na `authenticated`/`anon` i `request.jwt.claims` per scenariusz; każdy blok oczekiwanego błędu dopasowuje **konkretny SQLSTATE** (`42501` dla RLS/uprawnień kolumnowych, `23514` dla `CHECK`, `23505` dla `UNIQUE`, `P0002` dla złego kodu) — inny SQLSTATE albo brak błędu tam, gdzie był oczekiwany, to FAIL (wyjątek); nigdy `when others` jako PASS. Każdy scenariusz startuje ze stanu użytkownika, w którym testowana reguła jest jedyną możliwą przyczyną odmowy (np. bezpośredni INSERT do `group_members` wykonuje użytkownik **bez** grupy — inaczej `23505` maskuje brak polityki). Wymagane scenariusze (mapowanie na review):
- Izolacja widoczności A/B; auto-dołączenie właściciela; `INSERT ... RETURNING` na `groups`; druga grupa tego samego użytkownika odrzucona (F-01).
- #1/#4: bezpośredni INSERT do `group_members` odrzucony; `join_group` — dobry kod, zły kod (`P0002`), ponowne dołączenie (`23505`), dołączenie użytkownika już należącego do innej grupy.
- #2: właściciel nie usunie własnego członkostwa (`DELETE 0`); właściciel usuwa innego członka.
- #3: zwykły członek opuszcza grupę (`DELETE 1`) i przestaje widzieć grupę; nie-członek nie usuwa niczyjego członkostwa; członek nie usuwa cudzego wiersza.
- #5: `is_group_member(grupa)` zwraca `false` dla nie-członka; w `pg_proc` nie istnieje dwuargumentowa `is_group_member`.
- #7: pusta i zbyt długa nazwa odrzucone przez `CHECK`; nowo utworzona grupa ma `join_code` o długości 12.
- #8: INSERT z własnym `join_code` i UPDATE `join_code`/`id` → odmowa uprawnień; UPDATE `name` przechodzi.
- `anon` nie może wywołać `join_group`.

#### 2. Dokumentacja uruchamiania

**File**: `README.md`

**Intent**: Skrypt jest bezużyteczny, jeśli nikt nie wie, że istnieje — jedno miejsce w README, zgodnie z konwencją CLAUDE.md (komendy opisane w README).

**Contract**: nowa podsekcja `### RLS scenario checks` w sekcji `## Supabase Configuration` (po `### Auth routes`, przed `## Deployment`): 2–3 zdania, komenda uruchomienia i informacja, kiedy ją odpalać (po każdej migracji dotykającej RLS grup); wzmianka, że skrypt działa wyłącznie na lokalnej bazie.

### Success Criteria:

#### Automated Verification:

- Skrypt przechodzi na pełnym schemacie (kod wyjścia 0): `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 < supabase/checks/rls-scenarios.sql`
- Skrypt wykrywa regresję (celowana mutacja) — na pełnym schemacie odtwórz starą politykę INSERT: `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -X -c 'create policy "group_members_insert_self" on public.group_members for insert to authenticated with check (user_id = (select auth.uid()))'`; ta sama komenda skryptu kończy się wtedy kodem ≠ 0 na asercji bezpośredniego INSERT; następnie `npx supabase db reset` przywraca pełny schemat i skrypt znów przechodzi (kod 0)
- README jest sformatowane: `npx prettier --check README.md`

#### Manual Verification:

- Przegląd mapowania: każdy z punktów #1–#8 z review (patrz `change.md`) ma w skrypcie co najmniej jedną asercję, a wynik uruchomienia wypisuje czytelne linie PASS per scenariusz.

**Implementation Note**: Po ukończeniu tej fazy zatrzymaj się na ręczne potwierdzenie; po jego zakończeniu zmiana jest gotowa do `/10x-impl-review`.

---

## Testing Strategy

### Unit Tests:

N/A — brak test runnera w repo poza lint/build/smoke; logika RLS jest w SQL i weryfikowana skryptem z fazy 2.

### Integration Tests:

- `supabase/checks/rls-scenarios.sql` (faza 2) — asercje na prawdziwej lokalnej bazie z prawdziwymi politykami, rolami i triggerem; nie jest częścią CI.

### Manual Testing Steps:

1. `npx supabase start` (Docker), następnie `npx supabase db reset`.
2. Faza 1: trzy szybkie kontrole z Manual Verification (join, bezpośredni INSERT, właściciel nie usuwa siebie).
3. Faza 2: uruchomić skrypt, potem odtworzyć starą politykę INSERT na `group_members`, uruchomić skrypt i upewnić się, że pada na asercji bezpośredniego INSERT, po czym przywrócić pełny schemat `db reset`.

## Performance Considerations

`(select auth.uid())` jest obliczane raz na zapytanie (initplan) zamiast raz na wiersz. `is_group_member(id)` nadal wykonuje się per wiersz, ale trafia w indeks `group_members_group_id_idx` i `UNIQUE(user_id)`; przy skali „grono znajomych" bez znaczenia. Ten wzorzec (`(select auth.uid())`) będą kopiować tabele S-02+.

## Migration Notes

- Migracja nie modyfikuje istniejących wierszy; istniejące `join_code` (8 znaków) pozostają ważne, tylko nowo tworzone grupy dostają 12 znaków.
- `add constraint ... check` na `groups.name` zawiedzie, jeśli istniejący wiersz go narusza. Lokalnie `groups` jest puste; przed przyszłym pushem na produkcję (poza zakresem) sprawdzić, czy istnieją tam wiersze (nie zweryfikowano, czy F-01 trafiło na produkcję).
- Kontrakt dla S-01 (do uwzględnienia w jego planie): dołączanie wyłącznie `supabase.rpc('join_group', { p_join_code })` (błędy `P0002` / `23505`); INSERT do `groups` wyłącznie `{ name, owner_id }`; UPDATE `groups` wyłącznie `name`; członek może wyjść usuwając własny wiersz `group_members`, właściciel opuszcza grupę tylko przez jej usunięcie. Uprawnienia kolumnowe są zamknięte: każda nowa edytowalna kolumna `groups` wymaga jawnego `grant insert (kolumna)` / `grant update (kolumna)` w tej samej migracji, która ją dodaje — inaczej klient dostanie `permission denied` (`42501`).
- Self-leave zwykłego członka wychodzi poza literalne FR-003 — S-02/S-03 muszą zdecydować, co dzieje się z taskami wychodzącego członka.

## References

- Źródło ustaleń: `context/changes/group-rls-hardening/change.md` (Notes) — `/code-review` commita `9efb772`
- Zarchiwizowany plan F-01: `context/archive/2026-09-25-group-schema-and-rls/plan.md` (decyzje odłożone: `:37`, `:40-41`)
- Migracja do utwardzenia: `supabase/migrations/20260925003350_create_groups_and_group_members.sql`
- PRD: `context/foundation/prd.md` (Access Control, Non-Goals, Guardrail widoczności, FR-002, FR-003)
- Roadmapa: `context/foundation/roadmap.md` (S-01 `group-create-join-manage` konsumuje `join_group`)
- Brak środowiska staging: `context/changes/deployment/deployment-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja utwardzająca + regeneracja typów

#### Automated

- [x] 1.1 Obie migracje stosują się od zera bez błędów (`npx supabase db reset`) — 0bcef72
- [x] 1.2 Typy Supabase generują się i zawierają `join_group` (`npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts && grep -q join_group src/types.ts`) — 0bcef72
- [x] 1.3 Lint przechodzi (`npm run lint`) — 0bcef72
- [x] 1.4 Build przechodzi (`npm run build`) — 0bcef72

#### Manual

- [x] 1.5 Szybka kontrola: `join_group` (dobry/zły kod), bezpośredni INSERT odrzucony, właściciel nie usuwa własnego członkostwa — 0bcef72

### Phase 2: Skrypt scenariuszy RLS

#### Automated

- [x] 2.1 Skrypt scenariuszy przechodzi na pełnym schemacie (kod wyjścia 0) — a2d9553
- [x] 2.2 Skrypt kończy się kodem ≠ 0 po odtworzeniu starej polityki INSERT na `group_members` (celowana mutacja), a po `db reset` przechodzi z kodem 0 — a2d9553
- [x] 2.3 README jest sformatowane (`npx prettier --check README.md`) — a2d9553

#### Manual

- [x] 2.4 Każdy z punktów #1–#8 z review ma co najmniej jedną asercję w skrypcie, a wynik wypisuje linie PASS — a2d9553
