# Schemat grup i RLS dla widoczności per-grupa — Plan Brief

> Full plan: `context/changes/group-schema-and-rls/plan.md`

## What & Why

F-01 z roadmapy: pierwszy realny model danych StreakBoard — tabele `groups` i `group_members` w Supabase z RLS wymuszającym guardrail PRD „widoczność tylko dla własnej grupy". To Foundation, które odblokowuje S-01 do S-04 (całą resztę kamienia milowego M-1); nie zawiera UI ani endpointów API.

## Starting Point

Dziś: `supabase/migrations/` nie istnieje, jedyna dana to wbudowane `auth.users` Supabase. Auth działa (`src/lib/supabase.ts`, `src/middleware.ts` dają `context.locals.user.id`), ale nie ma żadnego modelu grup, ról ani RLS. `src/types.ts` nie istnieje.

## Desired End State

Po tym planie: zalogowany użytkownik może (na poziomie bazy) należeć do co najwyżej jednej grupy; widzi wyłącznie dane swojej grupy; tylko twórca grupy może nią zarządzać. `src/types.ts` daje S-01 gotowy, typowany kontrakt do budowy UI/API na tym schemacie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Jedna grupa na użytkownika | Wymuszone w DB (`UNIQUE` na `group_members.user_id`) | Guardrail nie może zostać złamany przez bug w przyszłym API — baza sama odrzuci drugie członkostwo. |
| Reprezentacja twórcy grupy | Kolumna `owner_id` na `groups` | Prosty, jednoznaczny model zgodny z PRD („jeden admin wystarczy na MVP"); RLS sprawdza jedno pole zamiast roli per wiersz. |
| Kod dołączania do grupy (FR-002) | Kolumna `join_code` na `groups`, bez osobnej tabeli zaproszeń | Najmniejszy schemat wystarczający na MVP — jeden stały kod na grupę; osobna tabela `group_invites` odrzucona jako przedwczesna złożoność. |
| Gdzie weryfikować migrację/RLS | Lokalnie (Supabase CLI + Docker) | Brak środowiska staging (deployment-plan.md) — błędna polityka RLS nie może trafić bezpośrednio na już żywą produkcję. |
| Jak weryfikować RLS | Ręczna checklist SQL (bez pgTAP) | Zero nowych narzędzi testowych — zgodne z obecnym stanem repo (brak test runnera poza lint/build/smoke) i z `top_blocker: time`. |
| Auto-dołączenie właściciela | Trigger `AFTER INSERT ON groups` wstawiający właściciela do `group_members` | Sprawia, że `UNIQUE(user_id)` egzekwuje „jedna grupa" również dla twórców, bez osobnej logiki w S-01. |
| Widoczność własnej grupy przy tworzeniu | SELECT na `groups`: `owner_id = auth.uid() OR is_group_member(...)` | Potwierdzone lokalnie: bez członu `owner_id` `INSERT ... RETURNING` (`.insert().select()`) failuje na RLS, bo trigger dodaje członka po sprawdzeniu SELECT; widoczność między grupami bez zmian. |
| Lint dla wygenerowanego `src/types.ts` | `ignores` w `eslint.config.js` | Output generatora łamie 10 reguł `strictTypeChecked`, a plik jest w całości nadpisywany przy każdej migracji — ręczne poprawki nie mają sensu. |
| Utwardzenie funkcji `SECURITY DEFINER` | `search_path = ''`, `revoke`/`grant execute`, indeks na `group_members(group_id)` | Funkcje w `public` są wystawione jako RPC PostgREST; `anon` nie może ich wywoływać. |
| Self-leave-group | Poza zakresem | PRD FR-007 dotyczy wypisania się z tasku, nie grupy; FR-003 daje usuwanie członka wyłącznie twórcy — nie wymyślamy dodatkowego uprawnienia. |

## Scope

**In scope:** tabele `groups` + `group_members`, funkcja `is_group_member()`, trigger auto-dołączenia właściciela, granularne polityki RLS (SELECT/INSERT/UPDATE/DELETE), wygenerowane typy TS w `src/types.ts` (wyłączone z lintu w `eslint.config.js`), lokalna weryfikacja (Docker).

**Out of scope:** tabela `tasks` i wszystko związane z taskami (S-02), endpointy API/UI do zarządzania grupą (S-01), self-leave-group, transfer własności grupy, wygasanie/rotacja `join_code`, automatyczne testy RLS (pgTAP), zastosowanie migracji na produkcji.

## Architecture / Approach

Jedna migracja SQL: dwie tabele, jedna funkcja pomocnicza `SECURITY DEFINER` (unika rekursji RLS na `group_members`), jeden trigger, sześć polityk RLS łącznie. Zaraz po niej — regeneracja `src/types.ts` z tego samego schematu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schemat grup i członkostwa z RLS + wygenerowane typy | Migracja (tabele, trigger, RLS) + `src/types.ts` + `ignores` w `eslint.config.js`, zweryfikowane lokalnie jako 3 użytkownicy testowi | Błąd w RLS po cichu łamie guardrail widoczności dla każdego kolejnego slice'a — stąd obowiązkowa ręczna checklist przed uznaniem fazy za ukończoną |

**Prerequisites:** Docker uruchomiony lokalnie (potwierdzone), `npx supabase` dostępne (devDependency), `.env` parsowalny przez Supabase CLI (naprawione, `npx supabase status` działa).
**Estimated effort:** jedna sesja implementacyjna — pojedyncza migracja + regeneracja typów.

## Open Risks & Assumptions

- Kolizja losowego `join_code` (8 znaków) jest pomijalna przy skali „grono znajomych" — brak logiki retry; jeśli projekt urośnie, do rewizji.
- Ręczna checklist SQL nie jest automatycznie powtarzalna — przy przyszłych zmianach schematu trzeba ją uruchomić ponownie ręcznie (świadomy koszt wybranego podejścia).
- Polityka INSERT na `group_members` (`user_id = auth.uid()`) pozwala dołączyć znając samo UUID grupy, bez `join_code`; walidacja kodu (np. RPC) należy do S-01.
- Wypchnięcie tej migracji na produkcję (już żywą, bez stagingu) jest świadomie poza zakresem tego planu — osobna decyzja po zielonej weryfikacji lokalnej.

## Success Criteria (Summary)

- Użytkownik widzi (SELECT) wyłącznie własną grupę i jej członków — nigdy dane cudzej grupy.
- Użytkownik nie może należeć do więcej niż jednej grupy, nawet jako twórca.
- Tylko twórca grupy może ją zaktualizować, usunąć lub usunąć z niej członka.
- Twórca może utworzyć grupę zwykłym `.insert().select()` bez błędu RLS.
- `src/types.ts` istnieje i typuje nowy schemat dla S-01, a `npm run lint` przechodzi.
