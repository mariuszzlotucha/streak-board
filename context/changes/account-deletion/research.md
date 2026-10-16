---
date: 2026-10-16T17:00:32Z
researcher: Claude (Opus 5.5) z Mariuszem Złotuchą
git_commit: 8412f3d
branch: s-15/account-deletion/plan
repository: streak-board
topic: "Usunięcie konta w ustawieniach: co w kodzie i w bazie dotyka grupy właściciela, tasków usuwającego i samego usunięcia z Supabase Auth"
tags: [research, account-deletion, groups, ownership, tasks, supabase-auth, rls, privacy]
status: complete
last_updated: 2026-10-16
last_updated_by: Claude (Opus 5.5)
---

# Research: usunięcie konta (S-15 `account-deletion`)

**Date**: 2026-10-16T17:00:32Z
**Researcher**: Claude (Opus 5.5) z Mariuszem Złotuchą
**Git Commit**: 8412f3d (master; gałąź planistyczna bez commitów, zmiany w roboczym drzewie)
**Branch**: s-15/account-deletion/plan
**Repository**: streak-board

## Research Question

Z ramy (`context/changes/account-deletion/frame.md`): usunięcie konta ma zabrać dane osoby, ale nie dane używane przez innych: grupa właściciela przechodzi na innego członka, a taski usuwającego zostają z postępem pozostałych. Pytania badawcze:

1. Co w bazie, trasach, UI i testach zależy od `groups.owner_id` i reguły „jeden stały właściciel” (N-02)?
2. Co dziś kasuje taski usuwającego i co czyta `tasks.created_by`?
3. Jak serwer może usunąć użytkownika z Supabase Auth i co dzieje się z jego sesją po usunięciu?
4. Które teksty (polityka prywatności, PRD, słownik) i które testy opisują dziś przeciwne zachowanie?
5. Jakie gotowe wzorce UI są dostępne dla okna z ostrzeżeniem na `/settings`?

## Summary

- **Własność grupy jest zabetonowana w trzech warstwach.** FK `groups.owner_id … on delete restrict` (`supabase/migrations/20260925003350_create_groups_and_group_members.sql:15`), kolumnowy grant `update (name)`, który nie obejmuje `owner_id` (`20260925011727_harden_group_rls.sql:97-99`), oraz polityka `group_members_delete_self`, która nie pozwala właścicielowi skasować własnego członkostwa (`:142-152`). W `src/` nie ma kodu, który zmienia `owner_id`. Test `group-permissions.test.ts:181` pilnuje, że klient nie może go zmienić (42501).
- **Taski usuwającego znikają przez jedną kaskadę.** `tasks.created_by … on delete cascade` (`20260930120000_create_tasks.sql:21`) kasuje task, a za nim uczestnictwa (`20261001090000_create_task_participants.sql:27`) i odznaczenia wszystkich (`20261002090000_create_task_checkoffs.sql:34`). Kolumna jest `not null`. Aplikacja czyta `created_by` w dwóch miejscach (`src/lib/tasks.ts:10,17,32` i porównanie z widzem w `src/components/dashboard/TaskRow.astro:35`) i nigdzie nie pokazuje nazwy twórcy.
- **Usunięcie z Auth: aplikacja dziś nie ma do tego uprawnień, baza lokalnie tak.** Serwer zna tylko `SUPABASE_URL` i `SUPABASE_KEY` (klucz anon wg `README.md:120,140`, schemat `astro.config.mjs:22-25`). Na lokalnym stosie rola `postgres` ma `DELETE` na `auth.users` (właściciel tabeli: `supabase_auth_admin`, `postgres` nie jest superuserem; zapytanie `has_table_privilege` w kontenerze `supabase_db_10x-astro-starter`, 2026-10-16). Na produkcji tego nie sprawdzono (luka, patrz Open Questions). Testy używają drugiej drogi: `auth.admin.deleteUser` z kluczem service-role (`tests/helpers/supabase.ts:28,150,168`).
- **Sesja usuniętego użytkownika już się poprawnie kończy.** `resolveAuthState` traktuje kod `user_not_found` jako `anonymous` (`src/lib/auth-state.ts:16-24,39`), więc chroniona strona przekierowuje na `/auth/signin` (`src/middleware.ts:37-39`) zamiast odpowiadać 503. Pokrywa to test `tests/unit/auth-state.test.ts:47`.
- **Teksty i testy opisują dziś odwrotność decyzji z ramy.** Polityka: „There is no delete button yet” i „grupa właściciela jest usuwana … taski w cudzej grupie są usuwane” (`src/components/privacy/AccountDeletion.astro:9-20`). Testy asercji kaskady tasków: `tests/integration/task-participation.test.ts:267-281`, `tests/integration/task-checkoffs.test.ts:410-424`, `supabase/checks/rls-scenarios.sql:630-639`. Testy reguły „właściciel zostaje”: `rls-scenarios.sql:215-234`, `group-permissions.test.ts:56-247`.
- **Okno z ostrzeżeniem ma gotowy wzorzec.** `ConfirmAction` (`src/components/groups/ConfirmAction.tsx`) to AlertDialog, który wysyła natywny POST. Już go używa „Delete group” na `/settings` (`src/components/dashboard/GroupSettingsCard.astro:29-35`). `/api/account` jest już chronione (`src/middleware.ts:9`).

## Detailed Findings

### 1. Własność grupy (`groups.owner_id`, N-02)

**Baza**

- FK z `restrict`, z komentarzem, że przyszłe usuwanie konta musi „usunąć lub przekazać grupę” (`20260925003350…sql:15`, `context/archive/2026-09-25-group-schema-and-rls/plan.md:55,72`).
- Granty: `grant insert (owner_id, name)`, `grant update (name)` (`20260925011727_harden_group_rls.sql:98-99`). Komentarz w `:95-96` mówi, że nowa edytowalna kolumna potrzebuje własnego grantu. Zmiana `owner_id` przez klienta jest więc dziś odrzucana na poziomie grantu, zanim zadziała RLS.
- Polityki oparte na `owner_id`: `groups_select_own_group` (`:108-110`), `groups_insert_as_owner` (`:112-113`), `groups_update_by_owner` (`:115-117`), `groups_delete_by_owner` (`:119-120`), `group_members_delete_by_group_owner` (`:129-139`), `group_members_delete_self` (`:142-152`, wyklucza właściciela).
- Trigger `add_owner_to_group` dopisuje właściciela do `group_members` przy tworzeniu grupy (`20260925003350…sql:56-74`).
- RPC `list_group_members` liczy `is_owner` jako `g.owner_id = gm.user_id` i sortuje właściciela pierwszego (`20261016175817_drop_email_from_list_group_members.sql:21,31,37`).
- `group_members.user_id` jest `unique` (jedna grupa na użytkownika, N-01, `20260925003350…sql:24`).

**Aplikacja (konsumenci `owner_id` / `is_owner`, pełna lista z grepa po `src/`)**

- `src/lib/groups.ts:9,17,22,45`: typ `MyGroup.owner_id`, `GroupMember.is_owner`, odczyt grupy.
- `src/components/dashboard/DashboardView.astro:38`: `isOwner = group.owner_id === viewerId`.
- `src/components/dashboard/SettingsView.astro:37`: ten sam warunek dla `GroupSettingsCard`.
- `src/components/dashboard/GroupSettingsCard.astro:22`: właściciel widzi zmianę nazwy i usunięcie, członek „Leave group”.
- `src/components/dashboard/MembersCard.astro:33,35`: plakietka „Owner” i przyciski „Remove” dla właściciela.
- `src/pages/api/groups/remove-member.ts:56`, `src/pages/api/groups/leave.ts:21-33`: trasy polegają na RLS, a pusty wynik tłumaczą przez porównanie z `owner_id`.
- `src/pages/api/groups/create.ts:29`: wstawienie z `owner_id: user.id`.
- `src/lib/settings-data.ts:23`: komentarz, że kontrola właściciela to `group.owner_id`.

Wszystkie te miejsca czytają `owner_id` przy każdym żądaniu, więc zmiana właściciela w bazie od razu zmienia UI nowego właściciela. Nie ma cache ani kopii tej wartości (wniosek z listy konsumentów powyżej).

**Testy przypięte do N-02**: `tests/integration/group-permissions.test.ts:56-247` (m.in. `:181` „A cannot change owner_id”, `:247` właściciel bez zmian), `supabase/checks/rls-scenarios.sql:215-234` („#2 the owner cannot delete their own membership”), `:263`. Sprzątanie w testach usuwa grupy przed użytkownikami właśnie z powodu `restrict`: `tests/helpers/supabase.ts:154-171`, `tests/setup/global-setup.ts:88-100`, `tests/e2e/local-supabase.ts:185,205`, z komentarzem w `tests/integration/rule-contracts.test.ts:26`.

**Dokumenty**: słownik definiuje właściciela jako „jedyny, stały zarządca grupy; … wychodzi tylko przez jej usunięcie” (`context/domain/glossary.md:11`). Niezmiennik N-02 ma status „egzekwuje” (`context/domain/01-domain-distillation.md:160`), a otwarte pytanie Q-09 dotyczy właśnie tej sytuacji (`:246`). INV-02 w `context/domain/02-invariant-aggregate-refactor.md:62` ma tę samą treść. PRD: FR-003 (`context/foundation/prd.md:70`) i akapit „Uprawnienia” (`:121`) mówią o „twórcy grupy”, bez następcy.

### 2. Taski usuwającego (`tasks.created_by`)

- `created_by uuid not null references auth.users (id) on delete cascade` (`20260930120000_create_tasks.sql:21`). Komentarz uzasadnia kaskadę tym, że „a task of a deleted account has no one left to manage it” (`:8-9`).
- Polityki `tasks_update_by_creator` i `tasks_delete_by_creator` wymagają `created_by = auth.uid()` oraz członkostwa (`:56-64`). Twórca, który wyszedł z grupy, traci zarządzanie, a task zostaje w grupie (`:10-11`, `context/archive/2026-09-30-task-create-and-manage/plan.md:17,34`).
- Trigger `add_creator_to_task` zapisuje twórcę jako uczestnika przy wstawieniu (`20261001090000_create_task_participants.sql:72-90`). Trigger `remove_member_task_participation` usuwa uczestnictwa osoby, która opuszcza grupę albo z niej znika (`:92-116`).
- Kaskada w dół: `task_participants.task_id … on delete cascade` (`:27`), `task_checkoffs (task_id, user_id) → task_participants … on delete cascade` (`20261002090000_create_task_checkoffs.sql:34`). Usunięcie tasku kasuje więc odznaczenia **wszystkich** jego uczestników (asercja `tests/integration/task-checkoffs.test.ts:410-424`).
- Własne dane usuwającego w cudzych taskach znikają niezależnie od `created_by`: `task_participants.user_id … on delete cascade` (`20261001090000…sql:28`), a za nim jego odznaczenia (ten sam test, `:423-424`). To zgadza się z decyzją z ramy (dane osoby znikają).
- Aplikacja: `src/lib/tasks.ts:10,17,32` (typ `GroupTask.created_by: string`, dwa `select`), `src/components/dashboard/TaskRow.astro:35` (Edit/Delete tylko gdy `task.created_by === viewerId`), `src/pages/api/tasks/create.ts:40`. Grep po `src/` nie znalazł innych odczytów; nazwa twórcy nie jest renderowana.
- Testy, które dziś zakładają kaskadę tasków przy usunięciu konta: `tests/integration/task-participation.test.ts:267-281` (`adminTask(dTaskId)` jest `null`), `tests/integration/task-checkoffs.test.ts:410-424`, `supabase/checks/rls-scenarios.sql:630-639` („deleting the creator's account cascades to their tasks”). `created_by` występuje też w `tests/integration/task-permissions.test.ts` (sekcja `cascades`, `:179`), `task-isolation.test.ts`, `data-routes.test.ts`, `rule-contracts.test.ts`, `tests/unit/dashboard-data.test.ts`, `tests/unit/checkoffs-reporting.test.ts` i w fixture'ach `src/components/dev/dashboard-fixtures.ts:125-126`.

### 3. Usunięcie z Supabase Auth i sesja

- Klient serwerowy: `createServerClient(SUPABASE_URL, SUPABASE_KEY)` z ciasteczkami żądania (`src/lib/supabase.ts:6-24`). Schemat env ma trzy sekrety: `SUPABASE_URL`, `SUPABASE_KEY`, `CONTACT_EMAIL` (`astro.config.mjs:22-25`). Grep `service_role|SERVICE_ROLE|admin.deleteUser` po `src/`, `astro.config.mjs` i `README.md` nie dał trafień poza `README.md:373` (opis testów). Sekrety workera ustawia się przez `wrangler secret put` (`README.md:258-263`); CI buduje z `SUPABASE_URL`/`SUPABASE_KEY` (`.github/workflows/ci.yml:72,316`), a joby lokalne wpisują klucz anon (`ci.yml:95,141,258`).
- Droga 1, API admina: testy wołają `adminClient().auth.admin.deleteUser(id)` z `supabaseServiceRoleKey` (`tests/helpers/supabase.ts:28,150,168`). Dla serwera aplikacji oznaczałoby to nowy sekret.
- Droga 2, funkcja w bazie: wzorzec `security definer` z `auth.uid()` istnieje (`set_nickname`, `20261016162551_add_nicknames.sql:62-80`). Lokalnie `postgres` ma `DELETE` na `auth.users` (zapytanie powyżej). FK do `auth.users` w lokalnej bazie (`pg_constraint`, 2026-10-16): schemat `auth` ma 9 kaskad (`identities`, `sessions`, `mfa_factors`, `one_time_tokens`, `oauth_authorizations`, `oauth_consents`, `webauthn_credentials`, `webauthn_challenges`, `mfa_recovery_code_sets`) i 1 `set null` (`scim_users`); `public` ma `groups` (restrict) oraz `group_members`, `tasks`, `task_participants`, `nicknames` (cascade). Cała operacja (następca, taski, usunięcie użytkownika) mieści się więc w jednej transakcji jednej bazy. To wniosek z FK, nie przetestowany przebieg.
- `auth.audit_log_entries` (kolumny `instance_id, id, payload, created_at, ip_address`) nie ma FK do `auth.users`. Usunięcie użytkownika nie kasuje więc jego „security log”, który polityka obiecuje trzymać „until your account is deleted” (`src/components/privacy/Retention.astro:8`, `WhatWeCollect.astro:19-21`). Na lokalnym stosie `payload` nie był czytany; to, czy wpisy zawierają e-mail lub id, jest niezweryfikowane.
- Po usunięciu: `getUser()` zwraca błąd, a kod `user_not_found` mapuje się na `anonymous` (`src/lib/auth-state.ts:16-24,39`; `tests/unit/auth-state.test.ts:47`). Zalogowany przez innego taba trafi na `/auth/signin` (`src/middleware.ts:37-39`), bez 503. Wylogowanie: `signout.ts` woła `supabase.auth.signOut()`, raportuje błąd i czyści ciasteczko `join_code` (`src/pages/api/auth/signout.ts:7-16`). Jak `signOut()` zachowuje się dla sesji już usuniętego użytkownika, nie sprawdzono.

### 4. Teksty, które opisują dziś przeciwne zachowanie

- `src/components/privacy/AccountDeletion.astro:9-20`: brak przycisku (`:10`), grupa właściciela usuwana (`:14-15`), taski w cudzej grupie usuwane (`:18-19`).
- `src/components/privacy/WhoCanSee.astro:13-15`: wyjście z grupy zostawia taski (ta obietnica pasuje do decyzji z ramy).
- `src/components/privacy/YourRights.astro`: prawo do usunięcia realizowane e-mailem „within one month”.
- `src/components/privacy/Retention.astro:8`, `WhatWeCollect.astro:19-21`: security log.
- Konwencja z `CLAUDE.md` (sekcja Conventions): zmiana faktów o modelu danych, widoczności lub usuwaniu aktualizuje politykę w tej samej zmianie.
- PRD: FR-003 i „Uprawnienia” (`prd.md:70,121`), brak FR o usunięciu konta (lista FR `:54-100`). Słownik: `glossary.md:11` (właściciel), `:21` (twórca tasku „dopóki jest w grupie”).

### 5. UI `/settings` i bramki widoku

- `SettingsView.astro:35-47`: `GroupSettingsCard` (albo tekst „You are not in a group yet”) i `AccountCard` w kolumnie `max-w-xl`. Strona nie pokazuje alertów `?error=`; akcje grupy kończą na `/dashboard` (`SettingsView.astro:7-8`).
- `AccountCard.astro:16-38`: nick, e-mail, link „Change nickname”; nie ma w nim akcji destrukcyjnej.
- `ConfirmAction.tsx:16-85`: props `action`, `fields`, `triggerLabel`, `title`, `description`, `confirmLabel`, `variant`. Formularz stoi obok dialogu, a przycisk potwierdzenia jest zwykłym `type="submit"` (komentarz `:74-75`). Opis jest jednym napisem (`description: string`), więc dłuższy, warunkowy tekst (właściciel / członek) to albo inny napis z serwera, albo zmiana komponentu.
- Smoke wiąże markup `/settings` wyrażeniami regularnymi: `SETTINGS_ON_DASHBOARD` (`scripts/smoke.mjs:401`), nagłówek i opis karty grupy (`:415-421`), kroki ustawień właściciela, członka i stanu bez grupy (`:891-934`, `:1073-1084`, `:1219-1228`, `:2350-2360`). Smoke zakłada konta przez rejestrację i ich nie usuwa (`:28-39`).
- Kitchen sink: stany `settings-owner`, `settings-member`, `settings-no-group`, `settings-load-failed` (`src/components/dev/dashboard-fixtures.ts:49-54,302-314`).
- E2E: `tests/e2e/group-settings-owner.spec.ts:12-20` (dialog usunięcia grupy z „Cancel”) i `group-settings-member.spec.ts` to gotowe wzorce scenariusza z oknem.
- Zakaz literałów ESLint obejmuje `src/components/{dashboard,groups,…}/` (CLAUDE.md, UI).

## Code References

- `supabase/migrations/20260925003350_create_groups_and_group_members.sql:15,24,56-74` - FK właściciela (restrict), unikalne członkostwo, trigger właściciel-członek
- `supabase/migrations/20260925011727_harden_group_rls.sql:95-152` - granty kolumn `groups` i polityki właściciela
- `supabase/migrations/20260930120000_create_tasks.sql:8-11,21,56-64` - kaskada `created_by` i polityki twórcy
- `supabase/migrations/20261001090000_create_task_participants.sql:27-28,72-116` - kaskady uczestnictwa, triggery twórcy i wyjścia z grupy
- `supabase/migrations/20261002090000_create_task_checkoffs.sql:13-16,34` - odznaczenia giną z uczestnictwem
- `supabase/migrations/20261016162551_add_nicknames.sql:62-80` - wzorzec funkcji `security definer` na `auth.uid()`
- `src/lib/auth-state.ts:16-24,39` - `user_not_found` jako wylogowanie
- `src/components/groups/ConfirmAction.tsx` - okno potwierdzenia z natywnym POST
- `src/components/privacy/AccountDeletion.astro:9-20` - obietnice do odwrócenia
- `tests/helpers/supabase.ts:28,150-171` - `auth.admin.deleteUser` w testach, sprzątanie grup przed użytkownikami

## Architecture Insights

- Reguły domeny są egzekwowane w bazie (granty kolumn, RLS, FK, triggery), a trasy i UI je powtarzają. Zmiana reguły N-02 lub kaskady tasków to więc migracja plus aktualizacja testów RLS i integracyjnych; sama zmiana tras nie wystarczy.
- Operacje przekraczające uprawnienia klienta idą przez funkcje `security definer` z `set search_path = ''` i `auth.uid()` (`join_group`, `set_nickname`, `list_group_members`). Serwer aplikacji nie ma klucza service-role.
- Migracje muszą przetrwać okno między `db push` a `wrangler deploy`: job `compat` uruchamia smoke wdrożonego kodu na nowym schemacie (`README.md:420`). Destrukcyjna część (np. zmiana `not null` lub FK) potrzebuje znacznika `-- compat:` (`README.md:419`).
- Dane usuwającego w tabelach `public` znikają dziś kaskadą z `auth.users`. Dwa wyjątki to `groups` (restrict) i `tasks` (cascade, ale wbrew decyzji). Poza bazą zostają logi i raporty błędów z user id (`WhatWeCollect.astro`, retencja 7 do 90 dni, `Retention.astro`).

## Historical Context (from prior changes)

- `context/archive/2026-09-25-group-schema-and-rls/plan.md:55,72`: `restrict` celowo, żeby usunięcie konta nie skasowało grupy po cichu; przyszła funkcja ma jawnie „usunąć lub przekazać grupę”. Nadal obowiązuje.
- `context/archive/2026-09-30-task-create-and-manage/plan.md:17,34`: task znika z kontem twórcy, a zostaje (bez zarządcy) po jego wyjściu z grupy; PRD akceptował ten przypadek brzegowy. Pierwsza część jest sprzeczna z decyzją z ramy (2026-10-16), druga obowiązuje.
- `context/archive/2026-10-16-nickname/research.md:80,95`: lista FK do `auth.users` i brak samoobsługowego usuwania. Obowiązuje; teraz dochodzi do niej `nicknames` (cascade).
- `context/domain/01-domain-distillation.md:160,246`: N-02 („egzekwuje”) i Q-09 (otwarte). Rama z 2026-10-16 rozstrzyga Q-09: grupa przetrwa.

## Related Research

- `context/changes/account-deletion/frame.md`: rama tej zmiany (decyzje właściciela).
- `context/archive/2026-10-16-nickname/research.md`: harness RLS, FK, granty.

## Open Questions

Rozstrzyga właściciel produktu w `/10x-plan` (z ramy, bez zmian):

- Kto zostaje następcą właściciela (reguła automatyczna czy wybór w oknie)? Co, gdy właściciel jest jedynym członkiem?
- Kto zarządza taskiem bez twórcy? Dziś po wyjściu z grupy nikt (`create_tasks.sql:10-11`).
- Czy przekazanie własności jest też osobną akcją w ustawieniach, czy tylko częścią usunięcia konta?
- Siła potwierdzenia w oknie, ponowne logowanie, karencja (`roadmap.md`, S-15 Unknowns).

Luki faktów (do sprawdzenia przed lub w trakcie planu):

- **Uprawnienie `postgres` do `DELETE` na `auth.users` na produkcji** jest niezweryfikowane (sprawdzone tylko lokalnie). Zapytanie dla operatora: `select has_table_privilege('postgres','auth.users','DELETE');` w SQL Editorze projektu. Od wyniku zależy, czy wystarczy funkcja w bazie, czy potrzebny jest klucz service-role.
- **Security log (`auth.audit_log_entries`) przeżywa usunięcie użytkownika** (brak FK). Nie sprawdzono, co zawiera `payload` ani czy Supabase czyści go sam. Polityka obiecuje go trzymać „until your account is deleted”.
- **`signOut()` po usunięciu użytkownika**: nie sprawdzono, czy czyści ciasteczka sesji, gdy GoTrue nie zna już sesji.
