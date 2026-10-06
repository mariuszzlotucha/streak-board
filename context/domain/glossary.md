# Słownik domeny StreakBoard (dla agentów)

Używaj terminów z kolumny „Nazwa w kodzie". Nazw z kolumny „Nie nazywaj" unikaj w nowym kodzie, planach i rozmowach. Mapa i uzasadnienia: `01-domain-distillation.md`.

## Grupa i członkostwo

| Termin                               | Co znaczy                                                                                | Nazwa w kodzie                                 | Nie nazywaj                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Grupa                                | Stała przestrzeń z wspólną tablicą; użytkownik należy do jednej                          | `groups`, `MyGroup`, `group_id`                | team, workspace, room                               |
| Członek                              | Użytkownik w grupie                                                                      | `group_members`, `GroupMember`                 | user (to konto Auth), participant (to poziom tasku) |
| Właściciel grupy (PRD: twórca grupy) | Jedyny, stały zarządca grupy; zawsze członek; z grupy wychodzi tylko przez jej usunięcie | `groups.owner_id`, `is_owner`, `isOwner`       | admin, creator (to słowo zarezerwowane dla tasku)   |
| Kod zaproszenia                      | Napis, który jest jedyną bramką wejścia do grupy; w UI „invite link"                     | `join_code`, `normalizeJoinCode`, `inviteLink` | token, invitation id, referral code                 |
| Oczekujące zaproszenie               | Kod zapamiętany w cookie na czas logowania                                               | `JOIN_CODE_COOKIE`, `pendingCode`              | session invite                                      |

## Task, uczestnictwo, odznaczenie

| Termin           | Co znaczy                                                                                  | Nazwa w kodzie                                              | Nie nazywaj                                                             |
| ---------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Task             | Element grupy: tytuł 1–80 znaków + cykliczność; tworzony przez członka                     | `tasks`, `GroupTask`, `task_id`                             | goal, habit, category, todo (to słowa z tekstów marketingowych)         |
| Cykliczność      | `once`, `daily` albo `weekly`; niezmienna po utworzeniu                                    | `recurrence`, `TaskRecurrence`, `TASK_RECURRENCES`          | frequency, interval, schedule, repeat                                   |
| Twórca tasku     | Członek, który utworzył task; edytuje tytuł i usuwa, dopóki jest w grupie                  | `tasks.created_by`, `created_by`                            | owner (to właściciel grupy)                                             |
| Uczestnictwo     | Zapis członka do tasku; twórca zapisany automatycznie                                      | `task_participants`, `TaskParticipant`                      | subscription, assignment, „przypisany task"                             |
| Uczestnik        | Członek zapisany do tasku                                                                  | `participant`, `participantsByTask`                         | member (to poziom grupy)                                                |
| Enrolment        | Para task + użytkownik razem z historią odznaczeń; w nowym kodzie preferuj „participation" | `EnrolmentPeriods`, widok `task_checkoff_periods`           | enrollment (pisownia US), signup                                        |
| Odznaczenie      | Fakt „uczestnik wykonał task w okresie"; cofnięcie dotyczy bieżącego okresu                | `task_checkoffs`, `checkOff`, `uncheck`, `checkoff` (trasy) | completion, tick (poza komentarzami), log entry, „done" jako rzeczownik |
| Okres            | Dzień kalendarzowy w Warszawie; dla `weekly` data poniedziałku tygodnia                    | `PeriodKey`, `periodKeyFor`, `task_checkoffs.period`        | occurrence, „wystąpienie", day/week jako klucz                          |
| Strefa aplikacji | Jedna strefa dla wszystkich: Europe/Warsaw                                                 | `APP_TIME_ZONE`                                             | local time, user timezone, UTC (UTC dotyczy tylko okna w bazie)         |

## Wynik i tablica wyników

| Termin               | Co znaczy                                                                              | Nazwa w kodzie                                     | Nie nazywaj                 |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| Streak               | Wartość per uczestnik i task po uwzględnieniu spadku; dla `once` 1 albo 0              | `streakValue`, `StreakSnapshot`                    | score, points, counter      |
| Spadek               | Każdy pominięty zamknięty okres połowi streak, w dół                                   | `decayStreak`                                      | penalty, reset, loss        |
| Migawka              | Wartość po ostatnim odznaczonym okresie sprzed bieżącego + czy bieżący jest odznaczony | `StreakSnapshot`, `snapshotOf`                     | state, cache                |
| Wynik członka        | Suma streaków po taskach, w których członek uczestniczy                                | `total`, `StandingInput`                           | points, score, rank         |
| Pozycja              | Miejsce na tablicy; równe wyniki dzielą pozycję (1, 1, 3)                              | `position`, `Standing`, `rankStandings`            | level, tier                 |
| Tablica wyników      | Lista wszystkich członków grupy z wynikiem i pozycją; nie jest osobną zakładką         | `Leaderboard`, `buildBoard`, `Board`               | scoreboard, tab, „zakładka" |
| Optymistyczna zmiana | Natychmiastowa zmiana wyniku widza przed odpowiedzią serwera                           | `publishDelta`, `applyDeltas`, `useCheckoffDeltas` | event, log                  |
| Nieznany członek     | Nazwa osoby bez e-maila                                                                | `UNKNOWN_MEMBER`                                   | anonymous, guest            |

## Tożsamość

| Termin     | Co znaczy                                                   | Nazwa w kodzie                                     | Nie nazywaj                                     |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Użytkownik | Konto Supabase Auth; wyłącznie tożsamość, bez roli w grupie | `locals.user`, `auth.users`, `user_id`             | member, account (w sensie członkostwa), profile |
| Logowanie  | E-mail + hasło albo konto Google                            | `signin`, `signup`, `google` (trasy `/api/auth/*`) | login (w nazwach tras i plików)                 |

## Pojęcia, których kod nie zna — nie wprowadzaj bez decyzji

- Poziomy, odznaki, osiągnięcia (wizja PRD je wspomina; kodu brak).
- Powiadomienia i przypomnienia.
- Historia, statystyki, wykresy streaków, rekord streaka.
- Task indywidualny jako osobny rodzaj tasku (każdy task należy do grupy).
- Nazwa wyświetlana lub profil (członek jest dziś rozpoznawany po e-mailu).
- Rotacja kodu zaproszenia, przekazanie własności grupy, wiele grup na użytkownika.
- Konfigurowalna strefa czasowa lub konfigurowalny spadek streaka.
