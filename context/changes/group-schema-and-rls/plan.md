# Schemat grup i RLS dla widoczności per-grupa — Plan implementacji

## Overview

F-01 z `context/foundation/roadmap.md`: wprowadzamy pierwszy realny model danych StreakBoard — tabele `groups` i `group_members` w Supabase, wraz z politykami RLS wymuszającymi guardrail PRD „widoczność tylko dla własnej grupy". To jest Foundation odblokowujący S-01 do S-04; nie zawiera żadnego UI ani endpointów API — te należą do S-01.

## Current State Analysis

- `supabase/migrations/` nie istnieje — brak jakichkolwiek własnych tabel; jedyna dana to wbudowane `auth.users` Supabase.
- `src/lib/supabase.ts:1-21` tworzy klienta SSR (`@supabase/ssr`) z cookie-based sesją; `src/middleware.ts:1-25` woła `supabase.auth.getUser()` i wystawia `context.locals.user` (zawiera `user.id`, UUID z `auth.users`).
- `src/types.ts` nie istnieje (CLAUDE.md flaguje to wprost jako "not yet created").
- CLAUDE.md już ustala konwencję: migracje w `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`, RLS włączone i granularne polityki per-operację/per-rolę na każdej nowej tabeli.
- Lokalny Supabase CLI nie jest zainstalowany na PATH, ale Docker jest dostępny i uruchomiony — `npx supabase` może pobrać CLI on-demand (`supabase` jest też w `devDependencies`). CLI wczytuje `.env` z roota repo i przerywa na każdej niepoprawnej linii (`LegacyDbConfigLoadError`); wymóg wstępny: `.env` musi być parsowalny — potwierdzone po poprawce, `npx supabase status` działa.
- `eslint.config.js` używa `strictTypeChecked` + `eslint-plugin-prettier/recommended` i nie ma `ignores` dla `src/types.ts`; surowy output `supabase gen types` łamie 10 reguł stylu (`consistent-type-definitions`, `consistent-indexed-object-style`, `no-redundant-type-constituents`), więc samo `prettier --write` nie wystarcza (potwierdzone przy pierwszej próbie implementacji fazy 1).
- Aplikacja jest już wdrożona produkcyjnie (Cloudflare Workers) i **nie ma środowiska staging** (`context/changes/deployment/deployment-plan.md`) — stąd decyzja, by tę migrację zweryfikować najpierw lokalnie.

### Key Discoveries:

- PRD Access Control (`context/foundation/prd.md:101-107`) już rozstrzyga model uprawnień: jeden stały twórca na grupę (zarządza grupą, usuwa członków), pozostali członkowie są sobie równi. Brak wielu administratorów, brak głosowania — nie trzeba tego wymyślać.
- PRD Non-Goals (`context/foundation/prd.md:111`) wyklucza przynależność do wielu grup — to twardy guardrail modelu danych, nie tylko UI.
- Guardrail „widoczność tylko dla własnej grupy" (`context/foundation/prd.md:36`) jest jedynym wymogiem bezpieczeństwa tego Foundation — wszystkie polityki RLS służą wyłącznie jemu.

## Desired End State

Po tym planie: w lokalnej (i docelowo produkcyjnej, po ręcznym `wrangler`/`supabase db push`) bazie Supabase istnieją tabele `groups` i `group_members` z włączonym RLS, tak że:
- Zalogowany użytkownik widzi (SELECT) wyłącznie grupę(y), do których należy, i wyłącznie członkostwa w tych grupach.
- Tylko twórca grupy może ją aktualizować/usuwać lub usuwać z niej członka.
- Użytkownik może należeć do co najwyżej jednej grupy — wymuszone przez `UNIQUE` na `group_members.user_id`, obejmujące również twórców dzięki triggerowi auto-dołączenia.
- `src/types.ts` zawiera wygenerowane typy Supabase dla nowego schematu, gotowe do konsumpcji przez S-01.

Weryfikacja: sekcja Success Criteria niżej (automatyczna + ręczna checklist SQL jako dwóch/trzech odrębnych użytkowników testowych).

## What We're NOT Doing

- Tabela `tasks` i wszystko związane z taskami (S-02).
- Endpointy API do tworzenia/dołączania/zarządzania grupą (S-01) — to Foundation dostarcza wyłącznie schemat i RLS.
- Samodzielne opuszczenie własnej grupy przez zwykłego członka — PRD FR-007 dotyczy wypisania się z *tasku*, nie z grupy; FR-003 daje usuwanie członka wyłącznie twórcy. Jeśli self-leave-group okaże się potrzebne, to osobna, jawna decyzja produktowa dla przyszłego slice'a.
- Transfer własności grupy / wielu administratorów — poza modelem PRD na MVP.
- Wygasanie lub rotacja `join_code`, wiele aktywnych kodów na grupę — jedna stała kolumna wystarcza na MVP; `group_invites` jako osobna tabela została odrzucona jako przedwczesna złożoność.
- Weryfikacja `join_code` przy dołączaniu — polityka INSERT na `group_members` (`user_id = auth.uid()`) pozwala dołączyć znając samo UUID grupy, bez kodu; UUID nie jest nigdzie ujawniany nie-członkom, więc ryzyko akceptujemy w F-01. Walidacja kodu (np. RPC `SECURITY DEFINER` przyjmujące `join_code`, i wtedy usunięcie tej polityki INSERT) należy do S-01.
- Retry/kolizje `join_code` — przy skali „grono znajomych" ryzyko kolizji krótkiego losowego kodu jest pomijalne; nie budujemy logiki ponawiania.
- Automatyczne testy RLS (pgTAP) — decyzja: ręczna checklist SQL, zgodnie z obecnym stanem repo (brak test runnera poza lint/build/smoke) i z `top_blocker: time` z roadmapy.
- Zastosowanie migracji na już wdrożonej bazie produkcyjnej w ramach tego planu — weryfikacja jest wyłącznie lokalna (Docker); wypchnięcie na produkcję jest osobnym, świadomym krokiem poza zakresem tego planu.

## Implementation Approach

Jedna migracja SQL tworzy obie tabele, funkcję pomocniczą `is_group_member()`, trigger auto-dołączenia właściciela i wszystkie polityki RLS w jednym pliku — to najmniejsza spójna jednostka, którą da się w całości zweryfikować lokalnie przed jakimkolwiek wdrożeniem. Zaraz po niej generujemy typy TypeScript z tego samego schematu, żeby S-01 miało od razu typowanego klienta.

## Critical Implementation Details

- **Pułapka rekursji RLS**: polityka SELECT na `group_members`, która sprawdzałaby przynależność przez podzapytanie do tej samej tabeli `group_members`, uderza w błąd Postgresa „infinite recursion detected in policy". Rozwiązanie: funkcja `is_group_member(p_group_id uuid, p_user_id uuid) RETURNS boolean` jako `SECURITY DEFINER STABLE`, używana zarówno w polityce SELECT na `groups`, jak i na `group_members`.
- **Trigger jako egzekutor guardrail „jedna grupa" również dla twórców**: `groups.owner_id` samo w sobie nie ma ograniczenia unikalności. Egzekwowanie odbywa się przez trigger `AFTER INSERT ON groups` (`SECURITY DEFINER`), który wstawia właściciela do `group_members`; ponieważ `group_members.user_id` ma `UNIQUE`, próba utworzenia drugiej grupy przez tego samego użytkownika powoduje naruszenie unikalności w triggerze i **rollback całej transakcji INSERT** na `groups` — nie tylko brak auto-dołączenia. To musi zostać zweryfikowane ręcznie (patrz Manual Verification), bo jest to nieoczywiste zachowanie transakcyjne.
- **Pułapka `INSERT ... RETURNING` (potwierdzona na lokalnej bazie)**: polityka SELECT sprawdzana jest dla zwracanego wiersza *przed* odpaleniem triggera `AFTER INSERT`, więc gdy SELECT na `groups` polega wyłącznie na `is_group_member()`, `INSERT ... RETURNING` (w supabase-js: `.insert().select()`) kończy się „new row violates row-level security policy", a zwykły INSERT przechodzi. Dlatego SELECT na `groups` ma dodatkowy warunek `owner_id = auth.uid()` — nie zmienia to widoczności między grupami, bo właściciel jest zawsze członkiem własnej grupy.
- **Kolejność w migracji ma znaczenie**: funkcja `is_group_member()` i tabela `group_members` muszą istnieć przed zdefiniowaniem polityk na `groups`, które jej używają; trigger na `groups` musi istnieć przed jakimkolwiek testowym INSERT-em.
- **`ON DELETE RESTRICT` na `groups.owner_id`**: żadna funkcja usuwania konta nie istnieje jeszcze w produkcie, ale gdyby powstała, próba usunięcia `auth.users` wiersza właściciela grupy zakończy się błędem FK zamiast po cichu skasować całą grupę wszystkim jej członkom. To celowe — implementator przyszłej funkcji usuwania konta musi jawnie obsłużyć „usuń lub przekaż grupę" jako osobny krok, zanim usunięcie konta może się powieść.

## Phase 1: Schemat grup i członkostwa z RLS + wygenerowane typy

### Overview

Pojedyncza migracja tworząca cały schemat i RLS dla F-01, regeneracja `src/types.ts` z tego samego schematu oraz wyłączenie tego wygenerowanego pliku z lintu.

### Changes Required:

#### 1. Migracja: tabele, trigger, RLS

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_groups_and_group_members.sql` (znacznik czasu nadany w momencie implementacji, wg konwencji CLAUDE.md)

**Intent**: Utworzyć minimalny schemat grup i członkostwa wymagany przez F-01, z RLS wymuszającym guardrail widoczności per-grupa i model uprawnień twórca/członek z PRD Access Control.

**Contract**:
- `groups`: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete restrict`, `name text not null`, `join_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)`, `created_at timestamptz not null default now()`. `ON DELETE RESTRICT` (not `CASCADE`) — an owner's account deletion must not silently destroy the whole group for every other member; deleting an account while it still owns a group is blocked until the group is transferred or deleted explicitly (no such flow exists yet — this FK is what makes the gap loud instead of silent).
- `group_members`: `id uuid pk default gen_random_uuid()`, `group_id uuid not null references groups(id) on delete cascade`, `user_id uuid not null unique references auth.users(id) on delete cascade`, `joined_at timestamptz not null default now()`. `UNIQUE(user_id)` egzekwuje „jedna grupa na użytkownika" (Non-Goal PRD) dla wszystkich, łącznie z twórcami (przez trigger niżej).
- Indeks na `group_members(group_id)` (pod polityki i `is_group_member`; `UNIQUE(user_id)` pokrywa tylko wyszukiwanie po użytkowniku).
- Funkcja `is_group_member(p_group_id uuid, p_user_id uuid) returns boolean` — `SECURITY DEFINER STABLE`, `SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id)`. `SET search_path = ''` (tabele w pełni kwalifikowane); `REVOKE EXECUTE ... FROM public, anon`, `GRANT EXECUTE ... TO authenticated` — funkcja jest widoczna jako RPC PostgREST, więc nie może być wywoływalna przez `anon`.
- Trigger `AFTER INSERT ON groups FOR EACH ROW` (funkcja `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE EXECUTE` od `public, anon, authenticated`) wstawiający `(NEW.id, NEW.owner_id)` do `group_members`.
- RLS włączone na obu tabelach. Każda polityka jawnie `TO authenticated` — nie polegamy na niejawnym zachowaniu `auth.uid() = NULL` dla roli `anon`. Polityki:
  - `groups` SELECT: `TO authenticated USING (owner_id = auth.uid() OR is_group_member(id, auth.uid()))` — człon `owner_id` jest potrzebny, by działał `INSERT ... RETURNING` (patrz Critical Implementation Details).
  - `groups` INSERT: `TO authenticated WITH CHECK (owner_id = auth.uid())`.
  - `groups` UPDATE/DELETE: `TO authenticated USING (owner_id = auth.uid())` (UPDATE dodatkowo `WITH CHECK (owner_id = auth.uid())`).
  - `group_members` SELECT: `TO authenticated USING (is_group_member(group_id, auth.uid()))`.
  - `group_members` INSERT: `TO authenticated WITH CHECK (user_id = auth.uid())` (umożliwia przyszłe dołączanie przez kod w S-01; samo `UNIQUE(user_id)` chroni przed dołączeniem do drugiej grupy).
  - `group_members` DELETE: `TO authenticated USING (EXISTS (SELECT 1 FROM groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid()))` — tylko twórca grupy usuwa członka.
  - Brak polityki UPDATE na `group_members` (brak edytowalnych pól — domyślna odmowa jest zamierzona).

#### 2. Wygenerowane typy Supabase

**File**: `src/types.ts`

**Intent**: Udostępnić typowany kontrakt nowego schematu (`groups`, `group_members`) dla S-01 i kolejnych slice'ów, zgodnie z konwencją CLAUDE.md ("shared types belong in src/types.ts").

**Contract**: Wygenerowane przez `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts` po zastosowaniu migracji lokalnie — surowy output generatora nie jest gwarantowany zgodny z konfiguracją Prettier tego repo, a `eslint-plugin-prettier/recommended` (`eslint.config.js`) zamienia każdą różnicę formatowania w błąd ESLint, więc krok `prettier --write` jest częścią kontraktu, nie opcjonalnym porządkiem. Plik jest w całości generowany — nie edytować ręcznie; kolejne migracje regenerują go w całości.

#### 3. Wyłączenie wygenerowanego pliku z lintu

**File**: `eslint.config.js`

**Intent**: `src/types.ts` jest w całości generowany i nadpisywany przy każdej migracji, więc reguły stylu `strictTypeChecked` nie mogą go blokować — poprawki ręczne i tak znikałyby przy regeneracji. Reszta repo pozostaje objęta lintem bez zmian.

**Contract**: dodać do eksportowanej konfiguracji pojedynczy wpis `{ ignores: ["src/types.ts"] }` (obok `includeIgnoreFile(gitignorePath)`, przed `baseConfig`). Prettier nadal formatuje plik krokiem `prettier --write` z komendy generowania.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się bez błędów lokalnie: `npx supabase db reset`
- Typy generują się bez błędów i plik nie jest pusty: `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`
- Lint przechodzi (z `src/types.ts` wyłączonym w `eslint.config.js`): `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Z trzema testowymi użytkownikami lokalnie (User A tworzy Grupę A, User B tworzy Grupę B, User C bez grupy): User A widzi (SELECT) wyłącznie Grupę A i jej `group_members`; nie widzi Grupy B ani jej członków.
- Tworzenie Grupy A przez User A automatycznie wstawia User A do `group_members` (trigger) — bez ręcznego insertu.
- `INSERT INTO groups ... RETURNING id` wykonany jako User A (twórca) zwraca wiersz bez błędu RLS (odpowiednik `.insert().select()` w supabase-js).
- Próba utworzenia przez User A drugiej grupy kończy się błędem naruszenia unikalności (guardrail „jedna grupa" egzekwowany także dla twórcy, przez trigger + `UNIQUE(user_id)`).
- User C (bez grupy) może wstawić siebie do `group_members` Grupy A (symulacja dołączenia przez kod); User A (już w grupie) nie może wstawić siebie do Grupy B.
- User A (twórca Grupy A) może usunąć wiersz członkostwa User C z Grupy A; User B (twórca Grupy B, nie członek Grupy A) nie może usunąć żadnego wiersza w `group_members` Grupy A.
- Tylko User A może zaktualizować lub usunąć Grupę A; próby User B i User C kończą się odmową (0 zmienionych wierszy pod RLS).

**Implementation Note**: Po ukończeniu tej fazy i przejściu weryfikacji automatycznej, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że weryfikacja manualna (checklist RLS powyżej) się powiodła, zanim F-01 zostanie oznaczone jako `done`.

---

## Testing Strategy

### Unit Tests:

N/A — decyzja: brak automatycznych testów RLS (pgTAP) na tym etapie; repo nie ma test runnera poza lint/build/smoke, a weryfikacja odbywa się przez ręczną checklist SQL (patrz Manual Verification i Manual Testing Steps).

### Integration Tests:

N/A — z tego samego powodu.

### Manual Testing Steps:

1. `npx supabase start` (wymaga Dockera — już potwierdzony jako dostępny i uruchomiony).
2. `npx supabase db reset` aby zastosować nową migrację od zera.
3. Utworzyć trzech testowych użytkowników w lokalnym `auth.users` (przez Supabase Studio lub `auth.admin` API).
4. Przejść przez checklistę z sekcji Manual Verification powyżej, używając lokalnego SQL editora z `SET request.jwt.claims` (lub odpowiednika `auth.uid()`) dla każdego użytkownika testowego po kolei.
5. Potwierdzić brak błędu „infinite recursion detected in policy" przy żadnym z powyższych zapytań.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01: `group-schema-and-rls`)
- PRD: `context/foundation/prd.md` (Access Control: linie 101-107; Non-Goals: linia 111; Guardrails: linia 36; FR-002, FR-003)
- Konwencja migracji/RLS: `CLAUDE.md` (Conventions)
- Klient Supabase: `src/lib/supabase.ts:1-21`
- Middleware auth: `src/middleware.ts:1-25`
- Brak środowiska staging: `context/changes/deployment/deployment-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schemat grup i członkostwa z RLS + wygenerowane typy

#### Automated

- [x] 1.1 Migracja stosuje się bez błędów lokalnie (`npx supabase db reset`)
- [x] 1.2 Typy Supabase generują się bez błędów (`npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`)
- [x] 1.3 Lint przechodzi (`npm run lint`)
- [x] 1.4 Build przechodzi (`npm run build`)

#### Manual

- [x] 1.5 Izolacja widoczności: User A nie widzi Grupy B ani jej członków
- [x] 1.6 Auto-dołączenie właściciela do `group_members` przy tworzeniu grupy potwierdzone
- [x] 1.7 `INSERT ... RETURNING` na `groups` jako twórca działa bez błędu RLS
- [x] 1.8 Próba utworzenia drugiej grupy przez tego samego użytkownika kończy się błędem
- [x] 1.9 User C dołącza do Grupy A przez insert; User A (już w grupie) nie może dołączyć do Grupy B
- [x] 1.10 Twórca grupy może usunąć wiersz członkostwa innego użytkownika; nie-twórca nie może usunąć żadnego wiersza w cudzej grupie
- [x] 1.11 Tylko twórca grupy może zaktualizować lub usunąć samą grupę
