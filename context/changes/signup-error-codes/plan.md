# Signup error codes and remembered email — Implementation Plan

## Overview

Rejestracja przechodzi na ten sam wzorzec błędów co logowanie: serwer mapuje błąd Supabase na stały kod, przekierowuje z `?error=<kod>`, a strona rozwiązuje kod na komunikat (nieznane wartości nie renderują nic). Błędy dotyczące konkretnego pola pokazujemy przy polu. Dodatkowo oba formularze (logowanie i rejestracja) zapamiętują e-mail po nieudanym wysłaniu przez krótkie ciasteczko HttpOnly, czym zamykamy odroczone punkty F2 i C3 pkt 3 z archiwalnego `ui-styles-audit`.

## Current State Analysis

- `signup.ts` wstawia `error.message` do `?error=`, nie ma try/catch, rzutuje `formData` przez `as string` (`src/pages/api/auth/signup.ts:5-17`). `signup.astro` przekazuje `?error=` do formularza bez żadnego rozwiązywania (`src/pages/auth/signup.astro:7,17`), więc dowolny tekst z URL-a pojawia się w Alercie (spoofing tekstu, nie XSS, bo React escapuje).
- Wzorzec do skopiowania: `SignInErrorCode`, `Record<Code, string>`, `toSignInErrorCode`, `resolveSignInError` z `Object.hasOwn` (`src/lib/auth-errors.ts:1-29`) oraz try/catch z `?error=unknown` w `src/pages/api/auth/signin.ts:5-27`.
- Lokalny Supabase (`enable_confirmations = false`, `minimum_password_length = 6`; `supabase/config.toml:175,209`) zwraca z `signUp`: `user_already_exists` (422), `weak_password` (422), `validation_failed` (400; zły format e-maila, puste hasło, hasło dłuższe niż 72 znaki) i `anonymous_provider_disabled` (422; pusty lub brakujący e-mail). Szczegóły i przypadki w `research.md`.
- Formularz nie ma limitu długości hasła (`SignUpForm.tsx:24-49`), więc `validation_failed` da się wywołać z UI hasłem >72 znaków.
- Oba formularze to natywny POST z redirectem (`SignInForm.tsx:49`, `SignUpForm.tsx:72`); e-mail żyje w `useState("")` (`SignInForm.tsx:14`, `SignUpForm.tsx:16`) i ginie przy przeładowaniu. W `src/` nie ma żadnego zapamiętywania wartości pól; jedyny zapis ciasteczka to `cookies.set` w `src/lib/supabase.ts:16`.
- `FormField` ma już `error` z `aria-invalid`, `aria-describedby` i `role="alert"` (`FormField.tsx:54-55,60-64`); kitchen sink logowania ma stany "Field error" i "Server error" (`src/components/dev/SignInStates.tsx`), więc wygląd błędów przy polu i w Alercie jest już zweryfikowany wizualnie.
- `scripts/smoke.mjs` ma 11 kroków; kroki rejestracji to tylko ścieżka sukcesu (`:42-46`), a `request()` zwraca tylko status i `location` (`:23-36`). README wymaga do smoke Supabase z wyłączonymi potwierdzeniami e-mail (sekcja Smoke test), więc asercje na duplikat nie dodają nowej zależności.

## Desired End State

- `/auth/signup?error=<dowolny tekst>` nie wyświetla tekstu; znane kody wyświetlają stałe komunikaty: `email_taken` i `weak_password` pod odpowiednim polem, `invalid_input`, `rate_limited`, `not_configured` i `unknown` w Alercie nad przyciskiem.
- Po nieudanym logowaniu lub rejestracji pole Email jest wypełnione, a hasła nie zapisujemy nigdzie. Ciasteczko znika po pierwszym wyświetleniu strony.
- `npm run smoke` obejmuje ścieżki błędów rejestracji, ciasteczko i brak odbicia obcego `?error=`; `npm run lint`, `npx astro check` i `npm run build` przechodzą.

### Key Discoveries:

- `research.md`: obserwowany kod dla zajętego e-maila to `user_already_exists`, nie `email_exists`; oba są w SDK (`node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts`). Kody limitów zapytań i `email_address_invalid` są w SDK, ale nie zostały odtworzone lokalnie.
- Przy włączonych potwierdzeniach e-mail SDK zwraca atrapę użytkownika zamiast błędu (`GoTrueClient.js:573-577`); wtedy `email_taken` nie wystąpi, a aplikacja przekieruje na `/auth/confirm-email` jak dziś. Nie zmieniamy tego zachowania.
- Wyspy `client:load` są renderowane na serwerze, więc wartość początkowa `useState(defaultEmail)` z propa daje ten sam HTML na serwerze i po hydratacji (bez mignięcia pustego pola).

## What We're NOT Doing

- Nie zapisujemy hasła w żadnej formie ani nie zapamiętujemy e-maila po udanym logowaniu lub rejestracji.
- Nie zmieniamy zachowania rejestracji przy włączonych potwierdzeniach e-mail ani strony `confirm-email`.
- Nie dodajemy fokusa na polu z błędem z serwera i nie zmieniamy `FormField`.
- Nie rozróżniamy przyczyn `validation_failed` po treści komunikatu Supabase; jedna ogólna wiadomość, a najczęstszy przypadek (hasło >72 znaki) blokuje formularz.
- Nie dodajemy stanów rejestracji do kitchen sinka ani zrzutów ekranu; weryfikacja wyglądu jest ręczna.
- Nie zmieniamy logowania poza zapamiętaniem e-maila; jego kody i komunikaty zostają.
- Nie aktualizujemy README (opis smoke jest ogólny) ani nie dotykamy `context/archive/`.

## Implementation Approach

Faza 1 dokłada kody rejestracji i ich rozwiązywanie (serwer, strona, formularz) razem z asercjami smoke, bez żadnego nowego mechanizmu. Faza 2 dokłada niezależny mechanizm ciasteczka na obu przepływach i jego asercje. Każda faza kończy się osobnym commitem.

Stałe komunikaty i kody trzymamy w `src/lib/auth-errors.ts` obok istniejących. Reguły haseł (min 6, max 72) trafiają do jednego pliku, z którego czytają zarówno formularz, jak i komunikaty, żeby liczby nie rozjeżdżały się. Rozwiązanie kodu zwraca też nazwę pola, którego błąd dotyczy, żeby strona mogła przekazać go formularzowi jako błąd pola.

## Critical Implementation Details

- **Timing & lifecycle**: ciasteczko `auth_email` ma `Path=/auth` i musi być kasowane z tym samym `path`, inaczej przeglądarka go nie usunie. Strona `.astro` odczytuje je i kasuje w tym samym żądaniu SSR, a formularz dostaje wartość propem, nie odczytuje jej po stronie klienta.
- **State sequencing**: błędy pól z serwera trafiają do początkowej wartości stanu `errors` w `SignUpForm`, dzięki czemu istniejące `clearError` czyści je przy pisaniu bez osobnej ścieżki.

## Phase 1: Signup error codes and field errors

### Overview

Zastępujemy odbicie surowego `?error=` kodami: mapowanie w `auth-errors.ts`, try/catch w `signup.ts`, rozwiązywanie na stronie, błędy przy polach w formularzu, limit 72 znaków oraz asercje smoke.

### Changes Required:

#### 1. Password rules

**File**: `src/lib/auth-rules.ts` (nowy)

**Intent**: Jedno źródło reguł haseł współdzielone przez formularz i komunikaty błędów.

**Contract**: eksportuje `MIN_PASSWORD_LENGTH = 6` (odzwierciedla `supabase/config.toml:175`) i `MAX_PASSWORD_LENGTH = 72` (limit Supabase zaobserwowany w `research.md`). `SignUpForm.tsx:9` przestaje definiować własne `MIN_PASSWORD_LENGTH`.

#### 2. Signup error codes

**File**: `src/lib/auth-errors.ts`

**Intent**: Dodać kody rejestracji, komunikaty i ich mapowanie, w stylu istniejącego wzorca logowania.

**Contract**:
- `type SignUpErrorCode = "email_taken" | "weak_password" | "invalid_input" | "rate_limited" | "not_configured" | "unknown"`.
- `toSignUpErrorCode(error: { code?: string }): SignUpErrorCode`: `user_already_exists` i `email_exists` → `email_taken`; `weak_password` → `weak_password`; `validation_failed`, `anonymous_provider_disabled` i `email_address_invalid` → `invalid_input`; `over_request_rate_limit` i `over_email_send_rate_limit` → `rate_limited`; reszta → `unknown`. Obserwowane lokalnie: `user_already_exists`, `weak_password`, `validation_failed`, `anonymous_provider_disabled`; pozostałe kody pochodzą z listy SDK i nie zostały odtworzone.
- `resolveSignUpError(param: string | null): { message: string; field?: "email" | "password" } | null` z ochroną `Object.hasOwn`; nieznane wartości zwracają `null`.
- Komunikaty: `email_taken` (pole `email`): "An account with this email already exists. Sign in instead."; `weak_password` (pole `password`): "Password must be at least 6 characters." zbudowany z `MIN_PASSWORD_LENGTH`; `invalid_input`: "Check your email and password and try again."; `rate_limited`: "Too many attempts. Please try again later."; `not_configured`: "Sign-up is not available right now."; `unknown`: "Something went wrong. Please try again."

#### 3. Signup handler

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Emitować kody zamiast surowych komunikatów i nie zostawiać niezłapanych wyjątków, tak jak `signin.ts`.

**Contract**: cała obsługa w try/catch; brak konfiguracji → `/auth/signup?error=not_configured`; błąd Supabase → `?error=${toSignUpErrorCode(error)}`; sukces → `/auth/confirm-email`; catch → `console.error("Sign-up request failed", error)` z tym samym wąskim `eslint-disable-next-line no-console` co w `signin.ts:24`, redirect `?error=unknown`.

#### 4. Signup page

**File**: `src/pages/auth/signup.astro`

**Intent**: Rozwiązać `?error=` przez `resolveSignUpError` zamiast odbijać tekst.

**Contract**: strona przekazuje formularzowi `serverError` (komunikat, gdy wynik nie ma pola) i `serverFieldErrors` (`{ email?: string; password?: string }`, gdy ma pole); brak wyniku → oba puste.

#### 5. Signup form

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Pokazać błędy z serwera przy polach i zablokować hasło dłuższe niż 72 znaki po stronie klienta.

**Contract**:
- Nowy prop `serverFieldErrors?: { email?: string; password?: string }`; początkowy stan `errors` (`SignUpForm.tsx:21`) startuje od niego.
- `validate()` (`:24-49`) dostaje regułę `password.length > MAX_PASSWORD_LENGTH` → "Password must be at most 72 characters" (z `MAX_PASSWORD_LENGTH`), sprawdzaną po regule minimum.
- `MIN_PASSWORD_LENGTH` importowane z `@/lib/auth-rules`.

#### 6. Smoke: signup failure paths

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć ścieżki błędów rejestracji i regresję F2 (brak odbicia obcego `?error=`).

**Contract**: `request()` (`:23-36`) zwraca dodatkowo `body` (tekst odpowiedzi); kroki mogą deklarować `bodyIncludes` i `bodyExcludes` obok `status` i `location`, a pętla sprawdzająca (`:65-75`) je uwzględnia. Nowe kroki: przed krokiem "signup creates account" (użytkownik anonimowy): `GET /auth/signup` → 200; `GET /auth/signup?error=Injected%20message` → 200 bez "Injected message" w treści; `GET /auth/signup?error=email_taken` → 200 z "already exists" w treści. Po "signup creates account": duplikat tego samego e-maila → 302 `/auth/signup?error=email_taken`; nowy e-mail z hasłem `"12345"` → `?error=weak_password`; nowy e-mail z hasłem 73 znaków → `?error=invalid_input`; e-mail `"not-an-email"` → `?error=invalid_input`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes against the built preview or dev server (all steps, including the new signup ones): `BASE_URL=http://localhost:4321 npm run smoke`
- The handler no longer redirects with the raw message: `grep -n "error.message" src/pages/api/auth/signup.ts` prints nothing

#### Manual Verification:

- Signing up in the browser with an already registered email shows the "already exists" message under the Email field, and typing in the field clears it
- A password of 73 characters is blocked in the browser with the message under the Password field and no request is sent
- Opening `/auth/signup?error=Hacked` shows no message; `/auth/signup?error=rate_limited` shows the Alert above the button; layout is acceptable on desktop and one mobile width

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Remember email after a failed submit

### Overview

Wspólny helper ciasteczka `auth_email` ustawiany przy błędzie w obu endpointach, konsumowany przez obie strony i przekazywany formularzom jako `defaultEmail`. Smoke sprawdza ciasteczko i prefill.

### Changes Required:

#### 1. Email cookie helper

**File**: `src/lib/auth-email.ts` (nowy)

**Intent**: Jedno miejsce z regułami ciasteczka, żeby oba endpointy i obie strony używały tej samej nazwy, ścieżki i czasu życia.

**Contract**:
- `AUTH_EMAIL_COOKIE = "auth_email"`.
- `rememberEmail(cookies: AstroCookies, email: unknown): void`: zapisuje tylko niepustego stringa po `trim()` o długości ≤ 254; opcje `path: "/auth"`, `httpOnly: true`, `sameSite: "lax"`, `secure: import.meta.env.PROD`, `maxAge: 60`. Inne wartości ignoruje.
- `takeRememberedEmail(cookies: AstroCookies): string`: zwraca wartość albo `""` i zawsze kasuje ciasteczko z `path: "/auth"`.

#### 2. Sign-in and sign-up handlers

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Zapamiętać e-mail wyłącznie przy przekierowaniach z błędem.

**Contract**: `rememberEmail(context.cookies, email)` przed każdym redirectem błędu, który następuje po odczytaniu `email` (brak konfiguracji i błąd Supabase); ścieżka `catch` go nie ustawia, bo `formData` mogło się nie sparsować. Redirecty sukcesu go nie ustawiają.

#### 3. Pages

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Odczytać i skasować ciasteczko w żądaniu SSR i przekazać e-mail formularzowi.

**Contract**: `const rememberedEmail = takeRememberedEmail(Astro.cookies)` wywoływane zawsze (żeby ciasteczko nie zostało); prop `defaultEmail={<wynik rozwiązania błędu> ? rememberedEmail : ""}`, czyli prefill tylko wtedy, gdy strona pokazuje błąd.

#### 4. Forms

**Files**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Wystartować pole Email od zapamiętanej wartości.

**Contract**: nowy prop `defaultEmail?: string`; `useState(defaultEmail ?? "")` w miejscu `SignInForm.tsx:14` i `SignUpForm.tsx:16`.

#### 5. Smoke: cookie and prefill

**File**: `scripts/smoke.mjs`

**Intent**: Zweryfikować, że ciasteczko jest ustawiane przy błędzie, konsumowane i wypełnia pole.

**Contract**: `request()` przyjmuje opcjonalne `cookie` (nadpisuje słoik ciasteczek, bo po kroku rejestracji sesja w słoiku jest ważna) i zwraca `setCookies` (surowe nagłówki `Set-Cookie`); kroki mogą deklarować `setCookie` (podciąg). Zmienione lub nowe kroki: "signin rejects wrong password" oczekuje `setCookie: "auth_email="`; duplikat rejestracji z fazy 1 oczekuje tego samego; `GET /auth/signin?error=invalid_credentials` z `cookie: auth_email=<encodeURIComponent(email)>` → 200, treść zawiera e-mail, a `Set-Cookie` kasuje `auth_email`; `GET /auth/signin` (bez błędu) z tym samym ciasteczkiem → treść nie zawiera e-maila.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes, including the cookie and prefill steps: `BASE_URL=http://localhost:4321 npm run smoke`
- Successful redirects do not set the cookie: `grep -n "rememberEmail" src/pages/api/auth/signin.ts src/pages/api/auth/signup.ts` shows calls only before error redirects (checked in review of the diff)

#### Manual Verification:

- After a wrong password the sign-in page shows the error and the Email field is filled, while the Password field is empty
- After signing up with an already registered email the Email field is filled and the message is under it
- In browser DevTools the `auth_email` cookie is HttpOnly with Path `/auth` and disappears after the error page loads; reloading the page leaves the Email field empty
- A successful sign-in or sign-up leaves no `auth_email` cookie

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Repozytorium nie ma runnera testów (`CLAUDE.md`); logikę mapowania pokrywa smoke przez endpointy.

### Integration Tests:

- `scripts/smoke.mjs`: kody rejestracji (`email_taken`, `weak_password`, `invalid_input` dwiema drogami), brak odbicia obcego `?error=`, znany kod na stronie, ciasteczko `auth_email` przy błędzie logowania i rejestracji, prefill i kasowanie. Ograniczenie limitu Supabase `sign_in_sign_ups = 30` na 5 minut na IP (`supabase/config.toml:190`): po tej zmianie jeden przebieg smoke wysyła 7 żądań rejestracji i logowania, więc pięć przebiegów w ciągu 5 minut z jednego IP przekroczy limit i może zwrócić `over_request_rate_limit`.

### Manual Testing Steps:

1. Zarejestruj konto, potem spróbuj ponownie z tym samym e-mailem i sprawdź komunikat pod polem Email.
2. Wpisz hasło 73 znaki i sprawdź komunikat pod polem Password bez wysyłania żądania.
3. Otwórz `/auth/signup?error=Hacked` i `?error=rate_limited`.
4. Zaloguj się błędnym hasłem i sprawdź wypełniony Email oraz pustą wartość po odświeżeniu; sprawdź ciasteczko w DevTools.

## Performance Considerations

Brak. Jedno ciasteczko o długości ≤ 254 znaków i ≤ 60 s życia; żadnych dodatkowych zapytań.

## Migration Notes

Brak zmian schematu ani danych. W projekcie Supabase z włączonymi potwierdzeniami e-mail duplikat nie zwraca błędu (`GoTrueClient.js:573-577`), więc `email_taken` się nie pojawi, a użytkownik trafi na `/auth/confirm-email` jak dotąd. Zachowanie ciasteczka na Cloudflare sprawdzamy w smoke na buildzie produkcyjnym (`npm run build` i `npm run preview`).

## References

- Related research: `context/changes/signup-error-codes/research.md`
- Archived follow-up: `context/archive/2026-09-25-ui-styles-audit/follow-ups/review-fixes.md` (F2), `charges.md` (C3 pkt 3)
- Similar implementation: `src/lib/auth-errors.ts:1-29`, `src/pages/api/auth/signin.ts:5-27`, `src/pages/auth/signin.astro:8`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Signup error codes and field errors

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 2b626f3
- [x] 1.2 Type check passes: `npx astro check` — 2b626f3
- [x] 1.3 Build passes: `npm run build` — 2b626f3
- [x] 1.4 Smoke passes against the built preview or dev server (all steps, including the new signup ones): `BASE_URL=http://localhost:4321 npm run smoke` — 2b626f3
- [x] 1.5 The handler no longer redirects with the raw message: `grep -n "error.message" src/pages/api/auth/signup.ts` prints nothing — 2b626f3

#### Manual

- [x] 1.6 Signing up in the browser with an already registered email shows the "already exists" message under the Email field, and typing in the field clears it — 2b626f3
- [x] 1.7 A password of 73 characters is blocked in the browser with the message under the Password field and no request is sent — 2b626f3
- [x] 1.8 Opening `/auth/signup?error=Hacked` shows no message; `/auth/signup?error=rate_limited` shows the Alert above the button; layout is acceptable on desktop and one mobile width — 2b626f3

### Phase 2: Remember email after a failed submit

#### Automated

- [x] 2.1 Lint passes: `npm run lint`
- [x] 2.2 Type check passes: `npx astro check`
- [x] 2.3 Build passes: `npm run build`
- [x] 2.4 Smoke passes, including the cookie and prefill steps: `BASE_URL=http://localhost:4321 npm run smoke`
- [x] 2.5 Successful redirects do not set the cookie: `grep -n "rememberEmail" src/pages/api/auth/signin.ts src/pages/api/auth/signup.ts` shows calls only before error redirects (checked in review of the diff)

#### Manual

- [x] 2.6 After a wrong password the sign-in page shows the error and the Email field is filled, while the Password field is empty
- [x] 2.7 After signing up with an already registered email the Email field is filled and the message is under it
- [x] 2.8 In browser DevTools the `auth_email` cookie is HttpOnly with Path `/auth` and disappears after the error page loads; reloading the page leaves the Email field empty
- [x] 2.9 A successful sign-in or sign-up leaves no `auth_email` cookie
