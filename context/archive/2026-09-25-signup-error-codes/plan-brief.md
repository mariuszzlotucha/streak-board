# Signup error codes and remembered email — Plan Brief

> Full plan: `context/changes/signup-error-codes/plan.md`
> Research: `context/changes/signup-error-codes/research.md`

## What & Why

Rejestracja dziś odbija w Alercie dowolny tekst z `?error=` (`signup.astro:7,17`), a e-mail znika po każdym nieudanym wysłaniu formularza, bo formularze robią natywny POST z przekierowaniem. Zmiana przenosi rejestrację na stałe kody błędów, jak zrobiono to dla logowania w `ui-styles-audit`, i zapamiętuje e-mail w obu formularzach. Zamyka to odroczone punkty F2 i C3 pkt 3.

## Starting Point

Logowanie ma `toSignInErrorCode` / `resolveSignInError` (`src/lib/auth-errors.ts`) i try/catch w `signin.ts`; rejestracja nie ma żadnego z nich. W `src/` nie ma zapamiętywania wartości pól. Lokalny Supabase (potwierdzenia wyłączone) zwraca z `signUp` cztery kody: `user_already_exists`, `weak_password`, `validation_failed` i `anonymous_provider_disabled`.

## Desired End State

Nieznany `?error=` nic nie wyświetla, znane kody dają stałe komunikaty: zajęty e-mail i słabe hasło pod odpowiednim polem, reszta w Alercie. Po nieudanym logowaniu lub rejestracji pole Email jest wypełnione, a hasło nigdy nie jest zapisywane.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zajęty e-mail | Komunikat wprost: konto istnieje, zaloguj się | Użytkownik wie, co zrobić, a lokalne API i tak ujawnia duplikat | Plan |
| `validation_failed` | Limit 72 znaków w formularzu + jeden ogólny komunikat | Jedyna znana droga z UI znika, reszta wymaga bezpośredniego POST-a | Plan |
| Zakres zapamiętania e-maila | Logowanie i rejestracja | Jedna wspólna implementacja, zajęty e-mail przy rejestracji to typowy błąd | Plan |
| Mechanizm | Krótkie ciasteczko HttpOnly `auth_email` (Path=/auth, 60 s) | Wartość jest w HTML z serwera: bez mignięcia i bez e-maila w URL-u lub JS | Plan |
| Gdzie błąd | Przy polu (email, password), reszta w Alercie | `FormField` ma już `error` z `aria-*` i `role="alert"` | Plan |
| Weryfikacja | Smoke + ręczna weryfikacja, bez kitchen sinka rejestracji | Stany "Field error" i "Server error" są już w kitchen sinku logowania | Plan |
| Kody Supabase | Obserwowane lokalnie plus kody z listy SDK, nieodtworzone | Kody limitów i `email_address_invalid` są w SDK, ale nie zostały sprawdzone | Research |

## Scope

**In scope:** kody i komunikaty rejestracji, try/catch w `signup.ts`, błędy przy polach, limit 72 znaków, ciasteczko `auth_email` w obu przepływach, asercje smoke.

**Out of scope:** zapisywanie hasła, zachowanie przy włączonych potwierdzeniach e-mail, fokus na polu z błędem, stany rejestracji w kitchen sinku, README, zmiany w `FormField`.

## Architecture / Approach

Serwer mapuje błąd Supabase na kod i przekierowuje z `?error=<kod>`; strona rozwiązuje kod przez `resolveSignUpError` (nieznany → `null`) i przekazuje formularzowi `serverError` albo `serverFieldErrors`. Reguły haseł (min 6, max 72) są w jednym pliku `src/lib/auth-rules.ts`. Ciasteczko ustawia helper `rememberEmail` przy błędnym redirectcie, a strona `.astro` konsumuje je (`takeRememberedEmail`) i przekazuje `defaultEmail` propem, tylko gdy pokazuje błąd.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Signup error codes and field errors | Kody, komunikaty, błędy przy polach, limit 72, asercje smoke | Kody limitów nieodtworzone lokalnie; przy potwierdzeniach e-mail duplikat nie zwraca błędu |
| 2. Remember email after a failed submit | Ciasteczko, prefill w obu formularzach, asercje smoke | Zachowanie `Astro.cookies` na Cloudflare (Secure w produkcji) sprawdzane dopiero w smoke na buildzie |

**Prerequisites:** lokalny Supabase z wyłączonymi potwierdzeniami e-mail (jak w README dla smoke) i uruchomiony dev lub preview.
**Estimated effort:** ~2 sesje, 2 fazy, około 10 plików.

## Open Risks & Assumptions

- Smoke wysyła po zmianie 7 żądań rejestracji i logowania; pięć przebiegów w 5 minut z jednego IP przekroczy limit Supabase 30 na 5 minut.
- Mapowania `email_exists`, `email_address_invalid` i kodów limitów opierają się na liście SDK, nie na obserwacji.
- Przy potwierdzeniach e-mail włączonych w projekcie hostowanym `email_taken` nie wystąpi; użytkownik trafia na `/auth/confirm-email` jak dziś.

## Success Criteria (Summary)

- `npm run lint`, `npx astro check`, `npm run build` i `npm run smoke` przechodzą, w tym nowe kroki rejestracji i ciasteczka.
- W przeglądarce: zajęty e-mail daje komunikat pod polem, `?error=Hacked` nic nie pokazuje, po błędnym haśle e-mail jest wypełniony, a ciasteczko znika po jednym wyświetleniu.
