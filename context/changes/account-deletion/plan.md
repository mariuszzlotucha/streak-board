# Usunięcie konta i przekazanie własności grupy (S-15 `account-deletion`) — plan implementacji

## Overview

Zalogowany użytkownik usuwa swoje konto na `/settings` po potwierdzeniu w oknie z ostrzeżeniem. Usunięcie zabiera dane osoby, ale nie dane używane przez innych: właściciel wybiera w oknie następcę, który przejmuje grupę (jedyny członek usuwa grupę razem z kontem), a taski utworzone przez usuwającego przechodzą na właściciela grupy razem z postępem wszystkich. Przekazanie własności jest też zwykłą akcją w ustawieniach grupy, a nowy właściciel raz widzi o tym baner na dashboardzie.

Rama (`frame.md`, pewność WYSOKA): „usunięcie konta musi zabrać dane osoby, ale nie dane, z których korzystają inni”. Badania: `research.md`.

## Current State Analysis

- **Właściciel jest zabetonowany w bazie.** `groups.owner_id … on delete restrict` (`supabase/migrations/20260925003350_create_groups_and_group_members.sql:15`, z komentarzem, że przyszłe usuwanie konta musi „delete or hand over the group first”). Klient ma tylko `grant update (name)` (`20260925011727_harden_group_rls.sql:98-99`), a `group_members_delete_self` wyklucza właściciela (`:142-152`). W `src/` nic nie zmienia `owner_id`; dziewięć miejsc czyta go przy każdym żądaniu (lista w `research.md` §1), więc zmiana w bazie od razu zmienia UI.
- **Taski usuwającego giną kaskadą.** `tasks.created_by … not null … on delete cascade` (`20260930120000_create_tasks.sql:21`), a za taskiem uczestnictwa i odznaczenia wszystkich (`20261001090000…sql:27`, `20261002090000…sql:34`). Aplikacja czyta `created_by` tylko w `src/lib/tasks.ts:10,17,32`, `TaskRow.astro:35` i `tasks/create.ts:40`. Twórca nie musi być uczestnikiem tasku („The creator can leave their own task like anybody else”, `20261001090000…sql:10-11`).
- **Usunięcie z Auth.** Serwer ma tylko klucz anon. Rola `postgres` ma `DELETE` na `auth.users` lokalnie i na produkcji (zapytanie właściciela 2026-10-16: `true`) oraz na `auth.audit_log_entries` lokalnie i na produkcji (zapytanie właściciela 2026-10-16: `true`). Wzorzec `security definer` + `set search_path = ''` + `auth.uid()`: `set_nickname` (`20261016162551_add_nicknames.sql:62-80`). Błędy domenowe z SQL idą przez własny SQLSTATE (`raise … using errcode = 'P0002'`, `harden_group_rls.sql:71`) i mapę w `src/lib/group-errors.ts`.
- **Dziennik bezpieczeństwa.** `auth.audit_log_entries` nie ma FK do `auth.users`; wpisy niosą `actor_id`, a `user_deleted` z API admina także `traits.user_email` (lokalnie, 2026-10-16). Polityka obiecuje go trzymać „until your account is deleted” (`src/components/privacy/Retention.astro:8`).
- **Sesja po usunięciu.** `user_not_found` mapuje się na `anonymous` (`src/lib/auth-state.ts:16-24,39`), a `signOut()` ignoruje 401/403/404 i czyści sesję (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:3419-3446`).
- **UI.** `ConfirmAction.tsx` (AlertDialog z natywnym POST; formularz obok dialogu, przycisk z atrybutem `form`), `native-select.tsx` w `src/components/ui/`. Akcje z `/settings` kończą na `/dashboard`, gdzie `?error=` pokazuje alert (`SettingsView.astro:7-8`, `dashboard-data.ts:57`). `group_members.joined_at` istnieje, `list_group_members` zwraca nick i `is_owner`.
- **Testy przypięte do starego zachowania.** Kaskada tasków przy usunięciu konta: `tests/integration/task-participation.test.ts:267-281`, `task-checkoffs.test.ts:410-424`, `supabase/checks/rls-scenarios.sql:630-639`. Sprzątanie usuwa grupy przed użytkownikami (`tests/helpers/supabase.ts:154-171`, `tests/setup/global-setup.ts:88-100`, `tests/e2e/local-supabase.ts`).

## Desired End State

- `/settings`, karta konta: przycisk „Delete account” otwiera okno, którego treść zależy od sytuacji (bez grupy, członek, jedyny członek-właściciel, właściciel z członkami; ostatni wariant z wymaganym wyborem następcy). Potwierdzenie usuwa konto w jednej transakcji, wylogowuje i kończy na `/?account=deleted` z komunikatem „Your account has been deleted.”.
- `/settings`, karta grupy właściciela z innymi członkami: „Transfer ownership” z wyborem członka. Po przekazaniu dawny właściciel zostaje członkiem (może wtedy wyjść z grupy), a nowy widzi na `/dashboard` baner, który zamyka przyciskiem „Got it”.
- Taski usuniętego konta zostają w swoich grupach z uczestnictwami i odznaczeniami innych; ich twórcą (zarządcą) jest właściciel grupy po usunięciu. Własne uczestnictwa, odznaczenia, nick, członkostwo, tożsamości, sesje i wpisy dziennika bezpieczeństwa usuniętego znikają.
- Usunięcie użytkownika inną drogą (dashboard Supabase, `auth.admin.deleteUser`), gdy jest twórcą tasku lub właścicielem grupy, kończy się błędem FK zamiast cichej kaskady; operator usuwa konto przez `public.delete_account(...)` w SQL Editorze.
- Polityka prywatności, PRD (FR-003, nowe FR-011 i FR-012), słownik i dokumenty domeny opisują nową regułę.

Weryfikacja: testy integracyjne i scenariusze RLS nowych funkcji, smoke (przekazanie, baner, usunięcie z asercją wyczyszczonych ciasteczek), e2e obu przepływów i ręczne sprawdzenie na produkcji (Faza 5).

### Key Discoveries:

- Wszystkie FK do `auth.users` w `public` i `auth` kaskadują, poza `groups` (restrict) i `scim_users` (set null) (`research.md` §3), więc przekazanie grupy, przepisanie tasków i usunięcie użytkownika mieszczą się w jednej transakcji jednej funkcji.
- Usunięcie z poziomu SQL nie zapisuje wpisu `user_deleted` z e-mailem, który zapisuje API admina (lokalny `auth.audit_log_entries`, 2026-10-16).
- Natywny `<select>` z atrybutem `form` należy do formularza, nawet gdy dialog jest portalem poza nim; to samo rozwiązanie co przycisk potwierdzenia w `ConfirmAction.tsx:74-80`.
- Smoke wiąże markup regexami i `role="alert"` tylko dla błędów (CLAUDE.md, UI): baner i komunikat na landingu to `role="status"`.

## What We're NOT Doing

- Okres karencji, przywracanie konta, ponowne logowanie przed usunięciem (Google nie ma hasła; okno chroni przed pomyłką — decyzja planu).
- Wpisywanie słowa lub nicka w oknie: wystarcza okno z przyciskiem, jak przy „Delete group”.
- Powiadomienia dla innych członków (poza banerem nowego właściciela) i baner dla właściciela, który dostał taski usuniętego członka bez zmiany własności.
- Automatyczny wybór następcy (najdłużej obecny członek): właściciel wybiera sam.
- Zapisywanie odbiorcy tasków do uczestnictwa: przejmuje zarządzanie, nie udział.
- Usunięcie konta bez nicka: brama nicka (`src/middleware.ts:54-57`) najpierw kieruje na `/account/nickname`; tak zostaje.
- Czyszczenie logów aplikacji i raportów Sentry z identyfikatorem użytkownika: znikają po retencji opisanej w `Retention.astro`.
- Zmiana reguły „właściciel nie może opuścić grupy” inaczej niż przez wcześniejsze przekazanie własności.
- Usuwanie użytkowników z panelu admina aplikacji (nie ma takiego panelu).

## Implementation Approach

Reguły zostają w bazie, jak reszta domeny: jedna migracja dodaje funkcje `security definer`, flagę banera i zmienia FK `tasks.created_by` na `restrict`. Funkcje mają dwie warstwy: wewnętrzną z jawnym `user_id` (bez `execute` dla `anon` i `authenticated`; dla operatora w SQL Editorze) i kliencką na `auth.uid()`. Trasy Astro tylko walidują wejście, wołają RPC, raportują błąd i przekierowują. UI rozszerza `ConfirmAction` o opcjonalny wybór członka zamiast budować nowy komponent.

Kolejność faz: baza (z testami) → przekazanie własności i baner (używa funkcji przekazania i rozszerzonego `ConfirmAction`) → usunięcie konta (używa obu) → dokumenty → wydanie. Migracja jest wstecznie zgodna z wdrożonym kodem: dodaje kolumnę z domyślną wartością, grant i funkcje, a `restrict` zmienia tylko usunięcie użytkownika, którego wdrożony kod nie wykonuje. Fazy 1–4 idą jednym przebiegiem `/10x-goal-implement` na jednej gałęzi i w jednym PR; Faza 5 należy do właściciela po merge'u.

## Critical Implementation Details

- **Kolejność w `delete_account`.** Najpierw grupa (przekazanie albo usunięcie), potem przepisanie tasków na `owner_id` grupy po przekazaniu, potem dziennik, na końcu `delete from auth.users`. Odwrotna kolejność kończy się błędem FK (`restrict` na `groups.owner_id` i `tasks.created_by`), a przepisanie tasków przed przekazaniem dałoby je usuwającemu. Wiersz grupy blokuj `for update` przed liczeniem członków i sprawdzeniem następcy: to szereguje dwa przekazania lub usunięcia tego samego właściciela (dwie karty) i wstrzymuje dołączenie do grupy (blokada FK `join_group` czeka). Nie zatrzymuje wyjścia następcy z grupy (`leave.ts:23` usuwa wiersz `group_members` pod RLS i nie dotyka `groups`), więc wyjście w tych samych milisekundach może zostawić właściciela spoza grupy. To okno jest zaakceptowane, jak w `20261001090000_create_task_participants.sql:16-19`; migracja opisuje je w komentarzu nad `transfer_group_ownership_for` (naprawa: operator w SQL Editorze; jeśli kiedyś zacznie mieć znaczenie, trigger `before delete` na `group_members` blokujący wiersz grupy `for share`).
- **Trasa usunięcia po sukcesie RPC.** Konto już nie istnieje, więc `signOut()` dostaje od GoTrue 403/404, które biblioteka ignoruje i czyści ciasteczka. Błąd `signOut()` się raportuje, ale nie zmienia przekierowania na `/?account=deleted`, bo konto zostało usunięte.

## Phase 1: Reguły w bazie

### Overview

Jedna migracja z funkcjami przekazania i usunięcia, flagą banera i `restrict` na `tasks.created_by`; wygenerowane typy; testy integracyjne i scenariusze RLS dla nowego zachowania, w tym odwrócenie trzech testów kaskady.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_account_deletion_and_ownership_transfer.sql` (znacznik czasu nowszy niż `20261016175817`)

**Intent**: Zastąpić regułę „jeden stały właściciel” regułą „właściciel przekazuje grupę członkowi, a przy usunięciu konta musi”, zachować taski usuwającego i dać serwerowi drogę do usunięcia użytkownika z Auth w jednej transakcji.

**Contract**:

- `groups.owner_notice_pending boolean not null default false`; `grant update (owner_notice_pending) on public.groups to authenticated` (istniejąca polityka `groups_update_by_owner` ogranicza do właściciela).
- `tasks.created_by`: FK `on delete restrict` w miejsce `cascade` (drop i add constraint), `not null` bez zmian; linia `-- compat: the deployed code never deletes users; restrict only changes deleting a task creator, which now goes through delete_account`.
- `public.transfer_group_ownership_for(p_owner uuid, p_new_owner uuid) returns void`: `p_owner` musi być właścicielem grupy (wiersz `for update`), w przeciwnym razie `42501`; `p_new_owner` musi być innym członkiem tej grupy, w przeciwnym razie (`null`, sam właściciel, nie-członek) `raise … using errcode = 'P0003'`; ustawia `owner_id = p_new_owner`, `owner_notice_pending = true`. Bez `execute` dla `public`, `anon`, `authenticated`.
- `public.transfer_group_ownership(p_new_owner uuid) returns void`: woła wersję `_for` z `auth.uid()`; `execute` dla `authenticated`.
- `public.delete_account(p_user_id uuid, p_successor uuid default null) returns void`: (1) jeśli `p_user_id` jest właścicielem grupy z innymi członkami → `transfer_group_ownership_for(p_user_id, p_successor)`; jeśli jest jej jedynym członkiem → usuwa grupę (kaskada tasków, uczestnictw, odznaczeń); u nie-właściciela `p_successor` jest ignorowany. (2) `update public.tasks … set created_by = <owner_id grupy tasku>` dla tasków `created_by = p_user_id` (obejmuje taski w grupach, z których wcześniej wyszedł). (3) `delete from auth.audit_log_entries` dla wpisów, których `payload->>'actor_id'` lub `payload->'traits'->>'user_id'` równa się `p_user_id::text`. (4) `delete from auth.users where id = p_user_id`; brak wiersza → `P0002`. Bez `execute` dla `public`, `anon`, `authenticated`.
- `public.delete_own_account(p_successor uuid default null) returns void`: `auth.uid()` puste → `42501`; inaczej woła `delete_account(auth.uid(), p_successor)`; `execute` dla `authenticated`.
- Wszystkie funkcje: `language plpgsql`, `security definer`, `set search_path = ''`, komentarz nad każdą jak w istniejących migracjach.

#### 2. Typy

**File**: `src/types.ts`

**Intent**: Regeneracja po migracji, żeby `rpc("transfer_group_ownership" | "delete_own_account")` i nowa kolumna były typowane.

**Contract**: `npx supabase gen types typescript --local > src/types.ts && npx prettier --write src/types.ts`; bez ręcznych zmian.

#### 3. Testy integracyjne

**File**: `tests/integration/account-deletion.test.ts` (nowy), `tests/integration/task-participation.test.ts:267-281`, `tests/integration/task-checkoffs.test.ts:410-424`, `tests/integration/group-permissions.test.ts`

**Intent**: Przypiąć nową regułę testami na prawdziwej bazie i odwrócić testy, które zakładały kaskadę tasków.

**Contract** (przypadki):

- Członek usuwa konto: znika z `auth.users`, `group_members`, `nicknames`, swoich `task_participants`/`task_checkoffs`; jego taski zostają z `created_by` = właściciel grupy, a uczestnictwa i odznaczenia innych na nich są nietknięte; wpisy dziennika z jego `actor_id` znikają.
- Właściciel z członkami i poprawnym następcą: następca jest `owner_id`, `owner_notice_pending = true`, taski właściciela przechodzą na następcę, grupa i postęp innych zostają.
- Właściciel bez następcy, z następcą spoza grupy, z samym sobą jako następcą: `P0003`, nic się nie zmienia (konto, grupa, taski).
- Jedyny członek-właściciel: grupa, jej taski i odznaczenia znikają razem z kontem.
- Twórca tasku w grupie, z której wyszedł: task przechodzi na właściciela tamtej grupy.
- `anon` nie może wołać `delete_own_account` ani `transfer_group_ownership`; `authenticated` nie może wołać `delete_account` ani `transfer_group_ownership_for`.
- `transfer_group_ownership`: właściciel → członek działa i ustawia flagę; nie-właściciel → `42501`; nie-członek/sam siebie → `P0003`; dawny właściciel może potem opuścić grupę (`group_members_delete_self`).
- Flaga: właściciel może ustawić `owner_notice_pending = false`; członek nie zmienia żadnego wiersza; klient nadal nie zmienia `owner_id` (istniejący test `:181` zostaje).
- Odwrócone testy kaskady: `auth.admin.deleteUser` twórcy tasku zwraca błąd ze statusem 500 i komunikatem „Database error deleting user” (GoTrue nie przekazuje SQLSTATE; sprawdzone lokalnie 2026-10-16 na `groups.owner_id`), a task i odznaczenia innych zostają. `23503` sprawdzają tylko scenariusze RLS, gdzie `delete` idzie w SQL.

#### 4. Scenariusze RLS

**File**: `supabase/checks/rls-scenarios.sql` (`:630-639`; usunięcia użytkowników w `:1204` i `:1288` zostają bez zmian, bo `m` i `b` nie tworzą tam tasków)

**Intent**: Zastąpić scenariusz „deleting the creator's account cascades to their tasks” scenariuszami `restrict` i `delete_account`, w stylu pliku.

**Contract**: scenariusz `delete from auth.users` twórcy tasku kończy się `foreign_key_violation`; `delete_account` przekazuje taski i grupę; scenariusz „#2 the owner cannot delete their own membership” zostaje bez zmian.

#### 5. Pomocnicze sprzątanie testów

**File**: `tests/helpers/supabase.ts`, `tests/setup/global-setup.ts`, `tests/e2e/local-supabase.ts`

**Intent**: Sprzątanie nadal działa przy `restrict` na `tasks.created_by` i toleruje użytkownika już usuniętego przez test (`delete_own_account`).

**Contract**: grupy przed użytkownikami (tak jest dziś); taski w grupach spoza sprzątanych (twórca, który wyszedł) usuwane przed użytkownikami; „user not found” przy usuwaniu nie przerywa sprzątania.

### Success Criteria:

#### Automated Verification:

- Migracja przechodzi strażnika: `npm run guard:migrations`
- Migracja aplikuje się na czystej bazie: `npx supabase db reset`
- Typy są świeże: `npm run types:check`
- Testy (unit i integracyjne) przechodzą, w tym nowy `tests/integration/account-deletion.test.ts`: `npm test`
- Scenariusze RLS przechodzą: `npm run test:rls`
- Lint i typy: `npm run lint && npx astro check`

#### Manual Verification:

- Właściciel potwierdził na produkcji `select has_table_privilege('postgres','auth.audit_log_entries','DELETE');` = `true` (przed merge'em PR)

---

## Phase 2: Przekazanie własności i baner nowego właściciela

### Overview

Akcja „Transfer ownership” w karcie grupy na `/settings`, trasy przekazania i zamknięcia banera, baner na `/dashboard`, kod błędu `invalid_successor`, stany kitchen sinka, smoke i e2e.

### Changes Required:

#### 1. `ConfirmAction` z wyborem członka

**File**: `src/components/groups/ConfirmAction.tsx`

**Intent**: Pozwolić oknu potwierdzenia zebrać jeden wymagany wybór (następcę), bez nowego komponentu dialogu.

**Contract**: opcjonalny prop `choice?: { name: string; label: string; placeholder: string; options: { value: string; label: string }[] }`; renderowany w treści dialogu jako `NativeSelect` z `form={formId}`, `required` i pustą opcją-placeholderem, z etykietą (`Label`). Bez `choice` komponent zachowuje się jak dziś.

#### 2. Dane ustawień

**File**: `src/lib/settings-data.ts`, `src/lib/groups.ts`, `tests/unit/settings-data.test.ts`

**Intent**: Ustawienia potrzebują członków grupy (wybór następcy, nick właściciela w oknie usunięcia), a dashboard flagi banera.

**Contract**: `MyGroup` zyskuje `owner_notice_pending: boolean` (select w `getMyGroup`); `loadSettings` zwraca `members: GroupMember[]` (z `listGroupMembers`, pusta lista bez grupy); błąd odczytu członków to ten sam `loadFailed` (503) co dziś.

#### 3. Akcja w karcie grupy

**File**: `src/components/dashboard/GroupSettingsCard.astro`, `src/components/dashboard/SettingsView.astro`

**Intent**: Właściciel z co najmniej jednym innym członkiem może przekazać grupę.

**Contract**: `ConfirmAction` „Transfer ownership” (`variant="outline"`) z `choice` = pozostali członkowie (nick albo „Unknown member”), `action="/api/groups/transfer"`, pole `new_owner_id`; tytuł „Transfer ownership?”, opis „The member you choose becomes the owner of {group}. You stay in the group as a member and can leave it afterwards.”, przycisk „Transfer ownership”. Bez innych członków akcji nie ma.

#### 4. Trasy

**File**: `src/pages/api/groups/transfer.ts`, `src/pages/api/groups/dismiss-owner-notice.ts` (nowe), `tests/integration/data-routes.test.ts`

**Intent**: Przekazanie przez RPC i zamknięcie banera przez aktualizację kolumny, jak inne trasy grup.

**Contract**:

- `POST /api/groups/transfer`: `new_owner_id` przez `normalizeUuid`; brak → `/dashboard?error=invalid_successor`; `rpc("transfer_group_ownership", { p_new_owner })`; błąd → `toGroupErrorCode` + `reportMapped("groups.transfer.failed", …)` → `/dashboard?error=<code>`; sukces → `/dashboard`; wyjątek → `reportError("groups.transfer.exception", …)` → `/dashboard?error=unknown`. `export const prerender = false`.
- `POST /api/groups/dismiss-owner-notice`: `update({ owner_notice_pending: false })` na grupie wywołującego (RLS ogranicza do właściciela); pusty wynik to cichy no-op; błąd raportowany jak wyżej (`groups.owner_notice.failed`); zawsze `/dashboard`.
- `data-routes.test.ts`: wiersze dla obu tras (sukces, błąd RPC/aktualizacji z raportem, wyjątek, brak `new_owner_id`), każda z zapisanym łańcuchem wywołań; strażnik pokrycia: 14 → 16 plików tras.

#### 5. Kod błędu

**File**: `src/lib/group-errors.ts`, `tests/unit/group-errors.test.ts`

**Intent**: Nieaktualny lub brakujący wybór następcy daje stały komunikat.

**Contract**: `GroupErrorCode` + `"invalid_successor"` z komunikatem „Choose a member of your group to take over.”; `P0003` → `invalid_successor`.

#### 6. Baner

**File**: `src/components/dashboard/DashboardView.astro`

**Intent**: Nowy właściciel raz dowiaduje się o przejęciu grupy.

**Contract**: gdy `isOwner && group.owner_notice_pending`: `Alert` z `role="status"` (wariant niebędący błędem) „You are now the owner of {group}. You can rename it, remove members or hand it over in Settings.” i formularz POST na `/api/groups/dismiss-owner-notice` z przyciskiem „Got it”; nad kartami, pod alertem błędu.

#### 7. Kitchen sink, smoke, e2e

**File**: `src/components/dev/dashboard-fixtures.ts`, `scripts/smoke.mjs`, `tests/e2e/group-transfer.spec.ts` (nowy)

**Intent**: Bramka wizualna, smoke i przeglądarka pokrywają nowe stany.

**Contract**:

- Fixtures: `settings-owner` z członkami (widać „Transfer ownership”), nowy `settings-owner-alone` (bez akcji), nowy `dashboard-new-owner` (baner).
- Smoke (na końcu sekwencji właściciel–członek, żeby nie zmienić założeń wcześniejszych kroków): `/settings` właściciela ma przycisk „Transfer ownership”; POST przekazania do członka → 302 `/dashboard`; dashboard członka ma baner `role="status"` i kontrolki właściciela, dawnego właściciela nie; POST „Got it” → baner znika; POST przekazania wysłany przez nowego właściciela z cudzym `new_owner_id` → `?error=invalid_successor` (od dawnego właściciela byłoby `forbidden`).
- E2E: właściciel otwiera okno, „Cancel” nic nie zmienia; wybór członka i potwierdzenie → dawny właściciel bez kontrolek właściciela; nowy widzi baner i zamyka go.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą (w tym `group-errors` i `settings-data`): `npm test`
- Lint, typy, build: `npm run lint && npx astro check && npm run build`
- Smoke przechodzi na lokalnym preview: `npm run smoke`
- E2E przechodzi: `npx playwright test tests/e2e/group-transfer.spec.ts tests/e2e/group-settings-owner.spec.ts tests/e2e/group-settings-member.spec.ts`

#### Manual Verification:

- Zrzuty kitchen sinka (`scripts/ui-screenshots.mjs`) dla `settings-owner`, `settings-owner-alone` i `dashboard-new-owner` obejrzane przez właściciela
- Okno przekazania z klawiatury: wybór członka, Cancel i potwierdzenie dostępne bez myszy

---

## Phase 3: Usunięcie konta

### Overview

Przycisk „Delete account” w karcie konta z czterema wariantami okna, trasa usunięcia z wylogowaniem, komunikat na landingu, stany kitchen sinka, smoke i e2e.

### Changes Required:

#### 1. Karta konta

**File**: `src/components/dashboard/AccountCard.astro`, `src/components/dashboard/SettingsView.astro`

**Intent**: Okno mówi wprost, co zniknie i co zostanie, zależnie od sytuacji usuwającego.

**Contract**: `AccountCard` dostaje kontekst usunięcia wyliczony w `SettingsView` z `group`, `viewerId` i `members`. `ConfirmAction` (`variant="destructive"`, `action="/api/account/delete"`), trigger „Delete account”, tytuł „Delete your account?”, przycisk „Delete account”; opis = część wspólna „Your account, nickname and check-offs are deleted right away. This cannot be undone.” plus:

- bez grupy: nic więcej;
- członek: „You leave {group}. Tasks you created stay in the group with everyone's progress and pass to its owner, {owner}.”;
- właściciel, jedyny członek: „Your group {group} is deleted with all its tasks and check-offs.”;
- właściciel z członkami: „Choose who takes over {group}. They also take over the tasks you created; everyone keeps their progress.” + `choice` (`successor_id`, pozostali członkowie).

#### 2. Trasa

**File**: `src/pages/api/account/delete.ts` (nowy), `tests/integration/data-routes.test.ts`, `tests/helpers/fake-supabase.ts`

**Intent**: Usunąć konto w jednej transakcji w bazie i zakończyć sesję.

**Contract**: `POST /api/account/delete`; `successor_id` przez `normalizeUuid` (brak lub niepoprawny → `null`, baza zdecyduje); `rpc("delete_own_account", { p_successor })`; błąd → `toGroupErrorCode` + `reportMapped("account.delete.failed", …)` → `/dashboard?error=<code>`; sukces → `supabase.auth.signOut()` (zwrócony błąd raportowany jako `account.delete.signout_failed`, bez zmiany wyniku), usunięcie ciasteczka `join_code` jak w `src/pages/api/auth/signout.ts`, 302 na `/?account=deleted`; wyjątek → `reportError("account.delete.exception", …)` → `/dashboard?error=unknown`. Żaden raport nie niesie e-maila ani nicka. `fake-supabase.ts` dostaje `auth.signOut()` ze skryptowanym wynikiem, zapisywany w łańcuchu wywołań; `data-routes.test.ts` dostaje wiersze trasy (sukces z wylogowaniem, błąd `signOut` tylko raportowany, `P0003` → `invalid_successor`, wyjątek), a strażnik pokrycia: 16 → 17 plików tras.

#### 3. Komunikat na landingu

**File**: `src/lib/landing.ts`, `src/pages/index.astro`, `tests/unit/landing.test.ts`

**Intent**: Potwierdzić usunięcie anonimowemu odwiedzającemu.

**Contract**: funkcja `accountDeletedNotice(url): boolean` (`account=deleted`); `landingRedirect` bez zmian i nadal pierwszy (zalogowany idzie na `/dashboard`); landing renderuje nad sekcjami linię `role="status"` „Your account has been deleted.” tylko przy tej wartości; tokeny, bez literałów.

#### 4. Kitchen sink, smoke, e2e

**File**: `src/components/dev/dashboard-fixtures.ts`, `scripts/smoke.mjs`, `tests/e2e/account-deletion.spec.ts` (nowy), `tests/e2e/helpers.ts`

**Intent**: Pokryć cztery warianty i pełny przepływ usunięcia.

**Contract**:

- Fixtures: stany `settings-*` mają kontekst usunięcia (przycisk „Delete account” w każdym).
- Smoke (po krokach Fazy 2): członek z taskiem odznaczonym przez innego usuwa konto → 302 na `/?account=deleted`; ciasteczka sesji Supabase wyczyszczone (minione `Expires` traktowane jak usunięcie, lekcja smoke); landing ma linię `role="status"`; `/dashboard` → 302 `/auth/signin`; logowanie tymi danymi się nie udaje; właściciel widzi task usuniętego z Edit/Delete i z odznaczeniem innego członka; POST usunięcia z obcym `Origin` → 403. Konto bez grupy usuwa się tak samo.
- E2E: Cancel nic nie zmienia; członek usuwa konto (komunikat na landingu, task u właściciela); właściciel z członkami wybiera następcę (następca ma baner, kontrolki właściciela i taski); jedyny członek-właściciel usuwa konto i grupa znika. Pomocniki tolerują użytkownika już usuniętego.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą (w tym `landing`): `npm test`
- Lint, typy, build: `npm run lint && npx astro check && npm run build`
- Smoke przechodzi na lokalnym preview: `npm run smoke`
- E2E przechodzi (cały zestaw): `npx playwright test`

#### Manual Verification:

- Zrzuty kitchen sinka dla stanów `settings-*` obejrzane przez właściciela
- Każdy z czterech wariantów okna przeczytany w przeglądarce: tekst odpowiada sytuacji, wybór następcy jest wymagany tylko u właściciela z członkami

---

## Phase 4: Dokumenty

### Overview

Polityka prywatności, PRD, słownik, dokumenty domeny, roadmapa, `CLAUDE.md` i `README.md` opisują nową regułę w tej samej zmianie (konwencja polityki w `CLAUDE.md`).

### Changes Required:

#### 1. Polityka prywatności

**File**: `src/components/privacy/AccountDeletion.astro`, `Retention.astro`, `WhatWeCollect.astro`, `YourRights.astro`, `WhoCanSee.astro`

**Intent**: Polityka mówi to, co robi kod.

**Contract**: usunięcie przyciskiem w Settings, natychmiast i nieodwracalnie; znikają konto, nick, członkostwo, własne uczestnictwa i odznaczenia, sesje, tożsamości logowania i wpisy dziennika bezpieczeństwa; zostają taski utworzone przez usuwającego (przechodzą na właściciela grupy, bez jego nazwy) z postępem innych; grupa właściciela przechodzi na wybranego członka, a gdy był jedynym członkiem, znika; e-mail do operatora zostaje dla kogoś, kto nie może się zalogować; logi i raporty błędów z identyfikatorem znikają po retencji z `Retention.astro`. `WhoCanSee`: właściciel może przekazać grupę.

#### 2. PRD i domena

**File**: `context/foundation/prd.md`, `context/domain/glossary.md`, `context/domain/01-domain-distillation.md`, `context/domain/02-invariant-aggregate-refactor.md`, `context/foundation/roadmap.md`

**Intent**: Zastąpić regułę „jeden stały właściciel” i zamknąć Q-09.

**Contract**: FR-003 mówi o właścicielu grupy (nie twórcy); nowe FR-011 (usunięcie konta w ustawieniach po potwierdzeniu; skutki jak wyżej; must-have) i FR-012 (właściciel przekazuje grupę członkowi; dawny właściciel zostaje członkiem; nowy widzi jednorazowy baner; must-have); akapit „Uprawnienia” (`prd.md:121`). Słownik `:11` (właściciel: jeden na grupę, przekazuje ją członkowi; przy usunięciu konta musi) i `:21` (twórca tasku; po usunięciu konta twórcy zarządza właściciel grupy). N-02 (`:160`) i INV-02 (`:62`) z nową treścią; Q-09 (`:246`) zamknięte z datą 2026-10-16. Roadmapa S-15: Outcome obejmuje przekazanie własności, Unknowns z rozstrzygnięciami tego planu.

#### 3. Instrukcje repo

**File**: `CLAUDE.md`, `README.md`

**Intent**: Następny agent i operator znają nowe trasy, funkcje i drogę ręcznego usunięcia.

**Contract**: `CLAUDE.md`: lista endpointów (`groups/transfer`, `groups/dismiss-owner-notice`, `account/delete`), opis `/settings` (przekazanie, usunięcie konta), schemat (funkcje `transfer_group_ownership`, `delete_own_account`; flaga banera). `README.md`: usunięcie konta przez operatora `select public.delete_account('<user id>', '<successor id or null>');` w SQL Editorze i informacja, że usunięcie w panelu Supabase twórcy tasku lub właściciela grupy kończy się błędem „Database error deleting user” (FK `restrict`); nowe specyfikacje e2e, jeśli README je wymienia.

### Success Criteria:

#### Automated Verification:

- Lint i formatowanie: `npm run lint && npx prettier --check context/foundation/prd.md context/domain CLAUDE.md README.md`
- Build (polityka renderuje się): `npm run build`
- Smoke przechodzi (strona `/privacy` i jej link `mailto:`): `npm run smoke`

#### Manual Verification:

- Właściciel przeczytał `/privacy` (sekcje usunięcia, retencji, praw) i zgadza się z treścią
- CI na PR zielone: `ci`, `smoke`, `e2e`, `integration`, `compat`, `ai-review`

---

## Phase 5: Wydanie produkcyjne

### Overview

Zamknięcie wycinka według lekcji „Close every slice by merging to master, approving the production release and checking the production URL”. Nie wchodzi do przebiegu `/10x-goal-implement`: wymaga merge'u i zatwierdzenia przez właściciela.

### Changes Required:

#### 1. Wydanie i zapis

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Migracja trafia na produkcję przed kodem, a wynik jest zapisany.

**Contract**: właściciel merge'uje PR, sprawdza nową migrację w commicie merge'a i zatwierdza `release` w środowisku `production`; wpis w następnej wolnej „Phase N” `deployment-plan.md` z datą, nazwą migracji i wynikiem ręcznych kontroli.

### Success Criteria:

#### Manual Verification:

- PR zmergowany, `release` zatwierdzony i zielony, tag `production` na commicie merge'a
- Na `https://streakboard.app`: dwa konta testowe, grupa, task odznaczony przez drugie konto; przekazanie własności i baner u nowego właściciela działają
- Na produkcji: członek usuwa konto i ląduje na `/?account=deleted`, a task zostaje u właściciela z odznaczeniem drugiego konta; właściciel-jedyny członek usuwa konto i grupa znika
- Wpis w `context/changes/deployment/deployment-plan.md` z datą, migracją i wynikiem

---

## Testing Strategy

### Unit Tests:

- `group-errors`: `P0003` → `invalid_successor`, komunikat stały, obcy `?error=` nie jest odbijany.
- `landing`: `accountDeletedNotice` tylko dla `account=deleted`; `landingRedirect` nadal pierwszy dla zalogowanego.
- `settings-data`: członkowie w danych ustawień, błąd odczytu członków → `loadFailed`.

### Integration Tests:

- Pełna macierz `delete_own_account` i `transfer_group_ownership` z Fazy 1 (sukcesy, `P0003`, `42501`, rollback przy błędzie, uprawnienia `anon`/`authenticated` do funkcji wewnętrznych).
- `restrict`: usunięcie twórcy tasku przez API admina kończy się błędem, dane innych zostają.
- Trasy `transfer`, `dismiss-owner-notice`, `account/delete` jako wiersze `tests/integration/data-routes.test.ts` (Fazy 2 i 3; strażnik pokrycia liczy pliki tras): przekierowania, raport błędu bez e-maila, cichy no-op.

### Manual Testing Steps:

1. Właściciel z członkiem: przekazanie, baner u nowego, „Got it”, dawny właściciel opuszcza grupę.
2. Członek z taskiem odznaczonym przez innego: usunięcie konta, komunikat na landingu, task z odznaczeniem u właściciela.
3. Właściciel z członkami: usunięcie bez wyboru następcy jest zablokowane przez formularz; z wyborem — następca przejmuje grupę i taski.
4. Właściciel, jedyny członek: usunięcie konta usuwa grupę; stary link zaproszenia nie działa.

## Performance Considerations

Usunięcie to jedna transakcja na kilku wierszach jednej grupy; `delete` z `auth.audit_log_entries` filtruje po `jsonb` bez indeksu, co przy obecnej wielkości tabeli (setki do tysięcy wierszy) jest pomijalne.

## Migration Notes

- Migracja jest wstecznie zgodna z wdrożonym kodem (sprawdza to `compat` na PR). Nowa kolumna ma domyślną wartość, a `restrict` dotyczy tylko usuwania użytkowników, którego wdrożony kod nie robi.
- Schemat nie cofa się razem z `wrangler rollback`: po wycofaniu kodu funkcje zostają, nikt ich nie woła, a `restrict` nadal chroni taski przed usunięciem użytkownika w panelu.

## References

- Rama: `context/changes/account-deletion/frame.md`
- Badania: `context/changes/account-deletion/research.md`
- Wzorzec funkcji: `supabase/migrations/20261016162551_add_nicknames.sql:62-80`
- Wzorzec okna: `src/components/groups/ConfirmAction.tsx`, `src/components/dashboard/GroupSettingsCard.astro:29-35`
- Wzorzec trasy RPC: `src/pages/api/account/nickname.ts`
- Wcześniejsze decyzje: `context/archive/2026-09-25-group-schema-and-rls/plan.md:55,72`, `context/archive/2026-09-30-task-create-and-manage/plan.md:17,34`
- Uruchomienie: `/goal` + `/10x-goal-implement account-deletion`, Fazy 1–4 na gałęzi `s-15/account-deletion/implementation` z `origin/master`, warunek „Phases 1–4 done, one PR opened; do not start Phase 5”

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły w bazie

#### Automated

- [x] 1.1 Migracja przechodzi strażnika: `npm run guard:migrations` — 2b44789
- [x] 1.2 Migracja aplikuje się na czystej bazie: `npx supabase db reset` — 2b44789
- [x] 1.3 Typy są świeże: `npm run types:check` — 2b44789
- [x] 1.4 Testy (unit i integracyjne) przechodzą, w tym nowy `tests/integration/account-deletion.test.ts`: `npm test` — 2b44789
- [x] 1.5 Scenariusze RLS przechodzą: `npm run test:rls` — 2b44789
- [x] 1.6 Lint i typy: `npm run lint && npx astro check` — 2b44789

#### Manual

- [x] 1.7 Właściciel potwierdził na produkcji `select has_table_privilege('postgres','auth.audit_log_entries','DELETE');` = `true` (przed merge'em PR) — `true`, 2026-10-16

### Phase 2: Przekazanie własności i baner nowego właściciela

#### Automated

- [x] 2.1 Testy przechodzą (w tym `group-errors` i `settings-data`): `npm test` — 3c1dc2f
- [x] 2.2 Lint, typy, build: `npm run lint && npx astro check && npm run build` — 3c1dc2f
- [x] 2.3 Smoke przechodzi na lokalnym preview: `npm run smoke` — 3c1dc2f
- [x] 2.4 E2E przechodzi: `npx playwright test tests/e2e/group-transfer.spec.ts tests/e2e/group-settings-owner.spec.ts tests/e2e/group-settings-member.spec.ts` — 3c1dc2f

#### Manual

- [ ] 2.5 Zrzuty kitchen sinka (`scripts/ui-screenshots.mjs`) dla `settings-owner`, `settings-owner-alone` i `dashboard-new-owner` obejrzane przez właściciela
- [ ] 2.6 Okno przekazania z klawiatury: wybór członka, Cancel i potwierdzenie dostępne bez myszy

### Phase 3: Usunięcie konta

#### Automated

- [x] 3.1 Testy przechodzą (w tym `landing`): `npm test`
- [x] 3.2 Lint, typy, build: `npm run lint && npx astro check && npm run build`
- [x] 3.3 Smoke przechodzi na lokalnym preview: `npm run smoke`
- [x] 3.4 E2E przechodzi (cały zestaw): `npx playwright test`

#### Manual

- [ ] 3.5 Zrzuty kitchen sinka dla stanów `settings-*` obejrzane przez właściciela
- [ ] 3.6 Każdy z czterech wariantów okna przeczytany w przeglądarce: tekst odpowiada sytuacji, wybór następcy jest wymagany tylko u właściciela z członkami

### Phase 4: Dokumenty

#### Automated

- [ ] 4.1 Lint i formatowanie: `npm run lint && npx prettier --check context/foundation/prd.md context/domain CLAUDE.md README.md`
- [ ] 4.2 Build (polityka renderuje się): `npm run build`
- [ ] 4.3 Smoke przechodzi (strona `/privacy` i jej link `mailto:`): `npm run smoke`

#### Manual

- [ ] 4.4 Właściciel przeczytał `/privacy` (sekcje usunięcia, retencji, praw) i zgadza się z treścią
- [ ] 4.5 CI na PR zielone: `ci`, `smoke`, `e2e`, `integration`, `compat`, `ai-review`

### Phase 5: Wydanie produkcyjne

#### Manual

- [ ] 5.1 PR zmergowany, `release` zatwierdzony i zielony, tag `production` na commicie merge'a
- [ ] 5.2 Na `https://streakboard.app`: dwa konta testowe, grupa, task odznaczony przez drugie konto; przekazanie własności i baner u nowego właściciela działają
- [ ] 5.3 Na produkcji: członek usuwa konto i ląduje na `/?account=deleted`, a task zostaje u właściciela z odznaczeniem drugiego konta; właściciel-jedyny członek usuwa konto i grupa znika
- [ ] 5.4 Wpis w `context/changes/deployment/deployment-plan.md` z datą, migracją i wynikiem
