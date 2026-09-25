# Signin: tokeny presetu shadcn i komponenty z `ui/` — Implementation Plan

## Overview

Widok `/auth/signin` (oraz wrapper `signup`, który współdzieli komponenty auth) przechodzi z literałów „cosmic glass" na tokeny semantyczne i komponenty `ui/` z presetu shadcn `b7Br7G9Kq` (`radix-maia`, `mist`, font Outfit). Plan zamyka zarzuty C1, C2, C4 i uzgodniony zakres C3 z `charges.md`; bramką jest strona kitchen sink dostępna tylko w dev.

## Current State Analysis

- Kontrakt tokenów jest kompletny, ale nieczytany: `:root` (32 zmienne), `.dark` (31), `@theme inline` (31 × `--color-*`, 4 × `--radius-*`) — `src/styles/global.css:6-111`; klasy semantyczne konsumuje tylko `button.tsx` (`research.md` §2, §4).
- Widok i komponenty auth używają wyłącznie klas palety / `white/*`: `signin.astro:10-17`, `FormField.tsx:5-6,37,41,53,59`, `ServerError.tsx:11`, `PasswordToggle.tsx:13`, `SubmitButton.tsx:18,22` (`charges.md` C1).
- Prymitywy zduplikowane: własny input/label/alert/karta; `SubmitButton` nadpisuje `Button` klasami `purple-*` (`charges.md` C2).
- `--background` jest czerwone (`global.css:8`, commit `d9de73d`).
- `components.json`: `style: new-york`, `baseColor: neutral`; w `ui/` tylko `button.tsx` (+ nieużywany `LibBadge.astro`); w `package.json` z Radix tylko `@radix-ui/react-slot`.
- Punkt wejścia: `middleware.ts:4,18-22` chroni tylko `/dashboard`; `api/auth/signin.ts:11,16` przekazuje surowe `error.message` w `?error=`, a `:19` przekierowuje na `/`; `signin.astro:5,14` renderuje dowolny `?error=`.
- Stan `loading` opiera się na `useFormStatus` (`SubmitButton.tsx:12`), a formularz to natywny `method="POST"` (`SignInForm.tsx:43`).
- Preset `b7Br7G9Kq` zbadano w katalogu tymczasowym (poza repo); surowe wartości: `context/changes/ui-styles-audit/tokens-source/`.

## Desired End State

`/auth/signin` i `/auth/signup` renderują się w jasnym motywie presetu (białe tło karty, szmaragdowy `primary`, font Outfit) wyłącznie z klas semantycznych i komponentów `ui/` (`Card`, `Input`, `Label`, `Alert`, `Button`). Żaden plik w `src/pages/auth/{signin,signup}.astro` ani `src/components/auth/*` nie zawiera klas palety ani `white`/`black`. Pola mają `aria-invalid`/`aria-describedby`, przełącznik hasła nie zasłania tekstu, przycisk pokazuje jawny stan `pending`. Zalogowany użytkownik nie widzi formularza logowania, logowanie kończy się na `/dashboard`, a `?error=` przyjmuje tylko znane kody. Kitchen sink (`/dev/signin-kitchen-sink`, 404 w buildzie produkcyjnym) pokazuje stany: default, empty, error pola, error serwera, disabled, loading; zrzuty desktop + mobile leżą w folderze zmiany. Weryfikacja: `npm run lint`, `npm run build`, `npm run smoke` oraz zrzuty.

### Key Discoveries:

- Preset zmienia styl na `radix-maia` (`Input`/`Button` = `rounded-4xl`, `Card` = `rounded-2xl ring-1`), dodaje font (`@fontsource-variable/outfit`), import `shadcn/tailwind.css` i pakiet `radix-ui` (zamiast `@radix-ui/react-slot`) — `tokens-source/preset-b7Br7G9Kq.global.css`, `.components.json`.
- W katalogu tymczasowym komponenty maia wygenerowały się z `import { cn } from "cn"` (nie `@/lib/utils`) — po `shadcn add` w repo trzeba to zweryfikować (patrz Critical Implementation Details).
- `Alert` maia ma wbudowane `role="alert"`; `Input` ma wbudowane style `aria-invalid:*` — wystarczy ustawić atrybut.
- `AuthError.code` z `@supabase/auth-js` 2.116 zawiera `invalid_credentials`, `email_not_confirmed`, `over_request_rate_limit` (`node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts`).
- `scripts/smoke.mjs` sprawdza logowanie prefiksem `/` i błąd prefiksem `/auth/signin?error=`, więc przejdzie po zmianie, ale wymaga zaostrzenia.

## What We're NOT Doing

- Nie uruchamiamy `shadcn init` w tym repo (nadpisałby `global.css`/`components.json`; wartości presetu przenosimy ręcznie).
- Nie aktywujemy dark mode (`.dark` z presetu trafia do pliku, ale nic go nie ustawia); brak przełącznika.
- Nie restylujemy `dashboard.astro`, `confirm-email.astro`, `Welcome.astro`, `Topbar.astro`, `LibBadge.astro`, `Banner.astro` (hex) — pozostają na literałach; `@utility bg-cosmic` zostaje. Czerwone hero (`Welcome.astro:21`) też.
- Nie mapujemy `?error=` na stronie `signup` i nie zmieniamy `api/auth/signup.ts` (odroczone).
- Nie zachowujemy e-maila po błędnym logowaniu (odroczone: wymaga decyzji o miejscu przechowania).
- Nie dodajemy walidacji serwerowej pól w `api/auth/signin.ts`.
- Nie dodajemy Playwright ani automatycznego baseline'u screenshotów.
- Nie dodajemy tokenów `--success`/`--warning` ani prymitywów widoku grupy (`research.md` §5) — to M-1.
- Nie instalujemy pakietu npm `cn` (to artefakt szablonu w katalogu tymczasowym).

## Implementation Approach

Kolejność „kontrakt przed pikselami": (1) tokeny presetu w jednym źródle, (2) komponenty maia w repo, (3) jeden widok + współdzielone komponenty auth, (4) punkt wejścia, (5) bramka wizualna. Zmiana jest podzielona tak, aby błąd w fazie 1–2 (zależności, globalny wygląd) był widoczny, zanim ktokolwiek dotknie widoku. Model według fazy (zalecenie skilla): najsilniejszy dostępny do fazy 1 i przeglądu, tańszy do pętli w fazach 3–5.

## Critical Implementation Details

- **Import `cn` po `shadcn add`.** Komponenty z presetu w katalogu tymczasowym importowały `cn` z `"cn"`. W tym repo alias to `@/lib/utils` (`components.json` `aliases.utils`); po `add` wykonaj `grep -rn 'from "cn"' src` i popraw na `@/lib/utils`, zamiast dodawać pakiet `cn`.
- **`pending` i bfcache.** Stan `submitting` ustawiany na `true` przed natywnym submitem zostaje w pamięci, gdy użytkownik wróci przyciskiem „Wstecz" (bfcache). Zresetuj go w `pageshow` z `event.persisted`.
- **Guard i ukośnik końcowy.** Astro obsługuje `/auth/signin/` tak samo jak `/auth/signin`; porównuj ścieżkę po obcięciu końcowego `/`, żeby guard nie dał się ominąć.

## Phase 1: Tokeny presetu i zrzuty „przed"

### Overview

Jedno źródło wartości w `global.css` pochodzi z presetu `b7Br7G9Kq`; repo dostaje wymagane zależności. Przed jakąkolwiek zmianą zapisujemy zrzuty obecnego signin.

### Changes Required:

#### 1. Zrzuty „przed"

**File**: `context/changes/ui-styles-audit/screenshots/before-signin-{desktop,mobile}.png`

**Intent**: Udokumentować stan wyjściowy `/auth/signin` (desktop ~1280 px, mobile ~390 px), żeby bramka końcowa miała punkt odniesienia.

**Contract**: Dwa pliki PNG zrobione na `npm run dev` przed zmianą `global.css`.

#### 2. Tokeny w `global.css`

**File**: `src/styles/global.css`

**Intent**: Zastąpić wartości `:root`, `.dark` i blok `@theme inline` wartościami z presetu, zachowując to, co jest poza kontraktem tokenów.

**Contract**: Dodać importy `shadcn/tailwind.css` i `@fontsource-variable/outfit` oraz komentarz z linią źródła na górze (`preset b7Br7G9Kq`, data, wskazanie na `tokens-source/`). `@theme inline` z presetu (`--font-sans`, `--font-heading`, `--radius-sm…4xl`, wszystkie `--color-*`). W `@layer base` dodać `html { @apply font-sans }`. Zachować `@custom-variant dark` i `@utility bg-cosmic` (używają go inne widoki). Skutek uboczny: `--background` = `oklch(1 0 0)` (koniec czerwonego tła).

#### 3. Konfiguracja shadcn i zależności

**File**: `components.json`, `package.json`, `package-lock.json`

**Intent**: Zsynchronizować konfigurację `shadcn add` z presetem i dodać pakiety wymagane przez preset.

**Contract**: `components.json`: `style: radix-maia`, `baseColor: mist` oraz klucze presetu (`rtl`, `menuColor`, `menuAccent`, `registries`); `aliases` i `iconLibrary` bez zmian. `npm install @fontsource-variable/outfit shadcn radix-ui` (nowe zależności stacka: nazwane wprost, zaakceptowane w decyzji o presecie).

### Success Criteria:

#### Automated Verification:

- Build przechodzi z nowym `global.css` i zależnościami: `npm run build`
- Lint przechodzi: `npm run lint`
- Źródło wartości jest w repo: `test -f context/changes/ui-styles-audit/tokens-source/preset-b7Br7G9Kq.global.css`
- `--background` nie jest już czerwone: `grep -n -- '--background: oklch(1 0 0)' src/styles/global.css`
- `bg-cosmic` zachowane: `grep -n 'utility bg-cosmic' src/styles/global.css`

#### Manual Verification:

- Zrzuty „przed" (desktop i mobile) istnieją i przedstawiają dotychczasowy signin
- Landing `/`, `/dashboard` i `/auth/signup` renderują się poprawnie po zmianie tokenów (zmienia się tylko font i tło `body` poza wrapperami; brak białego tekstu na białym tle)
- Font Outfit ładuje się (Network/Computed w DevTools)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Komponenty maia w repo

### Overview

Dodać `input`, `label`, `card`, `alert` i przeinstalować `button` w stylu presetu, tak aby cały katalog `ui/` pochodził z jednego stylu.

### Changes Required:

#### 1. Komponenty shadcn

**File**: `src/components/ui/{input,label,card,alert,button}.tsx`

**Intent**: Uzyskać komponenty ze stylu `radix-maia` przez ścieżkę właściwą dla stacka, bez ręcznego pisania prymitywów.

**Contract**: `npx shadcn@latest add input label card alert button --overwrite`. `Button` zachowuje API (`variant`, `size`, `asChild`) używane przez `SubmitButton`; dochodzą rozmiary `icon-xs` itd. `LibBadge.astro` bez zmian.

#### 2. Poprawka importów i sprzątanie zależności

**File**: `src/components/ui/*.tsx`, `package.json`

**Intent**: Upewnić się, że komponenty importują `cn` z aliasu repo i że nie zostaje martwa zależność.

**Contract**: Każdy import `cn` → `@/lib/utils`. Jeśli po `--overwrite` nic w `src` nie importuje `@radix-ui/react-slot`, usunąć je: `npm uninstall @radix-ui/react-slot`.

### Success Criteria:

#### Automated Verification:

- Wszystkie 5 plików istnieje: `ls src/components/ui/{input,label,card,alert,button}.tsx`
- Brak importów z pakietu `cn`: `! grep -rn 'from "cn"' src`
- Brak martwej zależności: `! grep -rn '@radix-ui/react-slot' src package.json`
- Build i lint przechodzą: `npm run build && npm run lint`

#### Manual Verification:

- `git diff --stat` pokazuje zmiany wyłącznie w `src/components/ui/`, `package.json` i `package-lock.json`
- `SubmitButton` nadal się kompiluje i przycisk renderuje się w stylu maia (sprawdzenie wizualne w fazie 3)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Widok signin, komponenty auth i wrapper signup

### Overview

Widok i współdzielone komponenty auth czytają tokeny i używają komponentów `ui/`; naprawiamy a11y i stan `pending` (zarzuty C1, C2, C4). `signup.astro` dostaje ten sam wrapper, żeby nie powstała regresja.

### Changes Required:

#### 1. Wrapper widoku signin

**File**: `src/pages/auth/signin.astro`

**Intent**: Zastąpić `bg-cosmic` i szklaną kartę tokenami i komponentem `Card`.

**Contract**: Tło strony `bg-muted`, treść w `Card` (max-w-sm, wyśrodkowana); nagłówek pozostaje `<h1>` z klasami semantycznymi; link „Sign up" jako `Button variant="link" asChild`. Przekazanie `serverError` bez zmian (mapowanie dopiero w fazie 4).

#### 2. Wrapper widoku signup

**File**: `src/pages/auth/signup.astro`

**Intent**: Ten sam wrapper co signin (karta, nagłówek, link „Sign in"), aby współdzielone komponenty nie wyglądały źle na ciemnej karcie.

**Contract**: Identyczna struktura jak w signin; bez zmian w logice `?error=`.

#### 3. `FormField`

**File**: `src/components/auth/FormField.tsx`

**Intent**: Oprzeć pole na `Input` i `Label` i naprawić dostępność oraz nakładanie się przełącznika hasła.

**Contract**: Zachować publiczne propsy (`id`, `label`, `value`, `onChange`, `error`, `hint`, `icon`, `endContent` itd.). Input z `pl-9` (ikona) i `pr-10` (miejsce na `endContent`); przy błędzie `aria-invalid="true"` i `aria-describedby="<id>-error"`, komunikat `<p id="<id>-error">` z `text-destructive`; ikona w `text-muted-foreground`. Wszystkie kolory z tokenów.

#### 4. `PasswordToggle`

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Zamienić surowy `<button>` na `Button variant="ghost" size="icon-xs"` (widoczny focus z tokenu `--ring`), zachowując pozycję po prawej stronie pola.

**Contract**: Zachować `aria-label` („Show/Hide password"), dodać `aria-pressed={visible}`; `type="button"`.

#### 5. `ServerError`

**File**: `src/components/auth/ServerError.tsx`

**Intent**: Użyć `Alert variant="destructive"` z ikoną i opisem zamiast ręcznego `<p>`.

**Contract**: `role="alert"` pochodzi z `Alert`; propsy bez zmian (`message?: string | null`).

#### 6. `SubmitButton` i formularze

**File**: `src/components/auth/SubmitButton.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`

**Intent**: Usunąć nadpisanie koloru `purple-*` i zależność od `useFormStatus`; stan ładowania sterowany jawnie przez formularz.

**Contract**: `SubmitButton` przyjmuje `pending: boolean` (zamiast `useFormStatus`); `Button type="submit"` z `className="w-full"`, `disabled={pending}`, spinner `LoaderCircle` z `animate-spin`. Oba formularze trzymają `submitting` (ustawiane na `true` po pozytywnej walidacji w `handleSubmit`, resetowane w `pageshow` gdy `event.persisted`) i przekazują `pending={submitting}`. Wskazówka w `SignUpForm.tsx:59` → `text-muted-foreground`.

### Success Criteria:

#### Automated Verification:

- Brak klas palety i white/black w zmienianych plikach: `! grep -rnE '(bg|text|border|ring|from|to|via|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}|(bg|text|border|ring|placeholder)-(white|black)' src/pages/auth/signin.astro src/pages/auth/signup.astro src/components/auth`
- Brak `useFormStatus`: `! grep -rn 'useFormStatus' src`
- Lint i build przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- `/auth/signin` i `/auth/signup` wyglądają spójnie (desktop i szerokość ~390 px)
- Klawisz Tab pokazuje widoczny focus na polach, przełączniku hasła, przycisku i linku
- Długie hasło nie wchodzi pod ikonę oka
- Puste pola + submit: komunikaty przy polach, `aria-invalid` obecne w DevTools
- Po submicie z wolną siecią (DevTools „Slow 3G") przycisk pokazuje „Signing in…" i jest nieaktywny
- Powrót przyciskiem „Wstecz" po nieudanym logowaniu nie zostawia przycisku w stanie „Signing in…"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Punkt wejścia (C3)

### Overview

Poprawki punktu wejścia `/auth/signin`: guard dla zalogowanych, logowanie kończy się w aplikacji, `?error=` przyjmuje tylko znane kody.

### Changes Required:

#### 1. Mapowanie błędów

**File**: `src/lib/auth-errors.ts` (nowy)

**Intent**: Jedno miejsce mapujące kody błędów Supabase na stałe komunikaty UI, żeby URL nie mógł wstrzyknąć własnego tekstu.

**Contract**: Typ `SignInErrorCode = "invalid_credentials" | "email_not_confirmed" | "rate_limited" | "not_configured" | "unknown"`; `toSignInErrorCode(error: { code?: string })` (mapuje `invalid_credentials`, `email_not_confirmed`, `over_request_rate_limit`→`rate_limited`, reszta→`unknown`); `resolveSignInError(param: string | null): string | null` zwraca komunikat tylko dla znanego kodu, w przeciwnym razie `null`. Komunikaty po angielsku, spójnie z UI (`invalid_credentials` → „Invalid email or password.").

#### 2. Endpoint logowania

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Przekazywać kod zamiast surowego `error.message`; po sukcesie kierować do aplikacji.

**Contract**: Brak konfiguracji → `/auth/signin?error=not_configured`; błąd Supabase → `/auth/signin?error=<toSignInErrorCode>`; sukces → redirect `/dashboard` (zamiast `/`).

#### 3. Strona signin

**File**: `src/pages/auth/signin.astro`

**Intent**: Wyświetlać wyłącznie rozpoznane komunikaty.

**Contract**: `const error = resolveSignInError(Astro.url.searchParams.get("error"))`; nieznana wartość → brak komunikatu.

#### 4. Guard w middleware

**File**: `src/middleware.ts`

**Intent**: Zalogowany użytkownik nie widzi formularzy logowania/rejestracji.

**Contract**: Stała `AUTH_ROUTES = ["/auth/signin", "/auth/signup"]`; dla `context.locals.user` i ścieżki (po obcięciu końcowego `/`) równej jednej z nich → `redirect("/dashboard")`. `/auth/confirm-email` i `/api/auth/*` bez zmian.

#### 5. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Zaostrzyć asercje do nowego zachowania i pokryć guard.

**Contract**: Złe hasło → location `/auth/signin?error=invalid_credentials`; poprawne logowanie → `/dashboard`; nowy krok: `GET /auth/signin` po zalogowaniu → 302 `/dashboard`; nowy krok przed logowaniem: `GET /auth/signin` → 200.

### Success Criteria:

#### Automated Verification:

- Lint i build przechodzą: `npm run lint && npm run build`
- Smoke przechodzi na działającym dev serwerze z lokalnym Supabase (wg README): `npm run smoke`
- Surowy `error.message` nie trafia już do URL: `! grep -n 'error.message' src/pages/api/auth/signin.ts`

#### Manual Verification:

- `/auth/signin?error=cokolwiek` nie pokazuje żadnego komunikatu; `?error=invalid_credentials` pokazuje stały komunikat „Invalid email or password."
- Złe hasło pokazuje stały komunikat w `Alert`
- Zalogowany wchodzący na `/auth/signin` i `/auth/signup` ląduje na `/dashboard`; `/auth/confirm-email` nadal dostępne
- Po zalogowaniu użytkownik ląduje na `/dashboard`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Kitchen sink i bramka wizualna

### Overview

Strona dev-only pokazuje stany signin obok siebie; zrzuty „po", kontrast i przegląd zamykają zmianę.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/signin-kitchen-sink.astro`, `src/components/dev/SignInStates.tsx`

**Intent**: Jedna strona renderująca prawdziwe komponenty (`Card`, `FormField`, `ServerError`, `SubmitButton`) we wszystkich nazwanych stanach.

**Contract**: Strona zwraca 404, gdy `import.meta.env.DEV` jest fałszem. Komórki: default (wypełnione), empty, error pola, error serwera, disabled, loading (`pending`); hover i focus sprawdzane interakcją na tej samej stronie (`client:load`). Komponent React wyłącznie z propsów/lokalnego stanu, bez wywołań sieciowych.

#### 2. Zrzuty „po" i status zarzutów

**File**: `context/changes/ui-styles-audit/screenshots/after-*.png`, `context/changes/ui-styles-audit/charges.md`

**Intent**: Dowód wizualny i domknięcie listy zarzutów.

**Contract**: Zrzuty: signin desktop + mobile, kitchen sink desktop + mobile, focus (Tab) na polu i przycisku. W `charges.md` dopisać status każdego zarzutu (C1–C4: załatwiony / odroczony z powodem).

### Success Criteria:

#### Automated Verification:

- Lint, build i smoke przechodzą: `npm run lint && npm run build && npm run smoke`
- Kitchen sink nie jest serwowany w buildzie produkcyjnym: po `npm run build && npm run preview` `curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/dev/signin-kitchen-sink` zwraca `404`
- Zrzuty istnieją: `ls context/changes/ui-styles-audit/screenshots/after-*.png`

#### Manual Verification:

- Wszystkie 6 stanów widoczne naraz na kitchen sink (desktop i ~390 px), bez poziomego scrolla
- Hover i focus (Tab) działają na polach, przełączniku, przycisku i linku
- Kontrast tekstu (etykiety, placeholder, komunikat błędu) ≥ 4.5:1 wg DevTools; różnice względem zrzutów „przed" są zamierzone
- `/10x-impl-review` uruchomione; ustalenia UI przeprowadzone przez triage wg wpływu na użytkownika
- `charges.md` zawiera status każdego zarzutu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Repo nie ma runnera testów jednostkowych (`CLAUDE.md`); `toSignInErrorCode` i `resolveSignInError` są czystymi funkcjami pokrytymi pośrednio przez smoke (kod błędu w `Location`) i ręcznie (nieznany kod w URL).

### Integration Tests:

- `npm run smoke`: strona signin 200 dla anonimowego, złe hasło → `?error=invalid_credentials`, logowanie → `/dashboard`, guard dla zalogowanego → `/dashboard`.

### Manual Testing Steps:

1. `npm run dev`; zrzuty „przed" na czystym `master` (faza 1).
2. Po fazie 3: signin/signup na desktopie i ~390 px, Tab przez cały formularz, długie hasło, puste pola, wolna sieć.
3. Po fazie 4: `?error=` z nieznaną i znaną wartością, złe hasło, wejście zalogowanego na `/auth/signin`.
4. Po fazie 5: kitchen sink (6 stanów), `npm run build && npm run preview` i sprawdzenie 404 trasy dev.

## Performance Considerations

Font Outfit Variable dodaje jeden plik fontu do wszystkich stron (globalne `font-sans`); pakiet `radix-ui` jest importowany selektywnie (`Slot`, `Label`), więc tree-shaking ogranicza koszt. Brak innych zmian wydajnościowych.

## Migration Notes

Brak danych do migracji. Zmiana wyglądu `Button` (pigułka, zielony `primary`) i fontu jest globalna, ale poza signin/signup dotyka tylko fontu i tła `body` (pozostałe widoki nie czytają tokenów). Wycofanie: `git revert` commitów faz; zależności `radix-ui`, `shadcn`, `@fontsource-variable/outfit` można usunąć razem z fazą 1.

## References

- Related research: `context/changes/ui-styles-audit/research.md`
- Zarzuty: `context/changes/ui-styles-audit/charges.md`
- Źródło tokenów: `context/changes/ui-styles-audit/tokens-source/`
- Kontrakt tokenów: `src/styles/global.css:6-111`
- Kontrakt punktu wejścia: `src/middleware.ts:4-22`, `src/pages/api/auth/signin.ts:4-20`, `src/pages/auth/signin.astro:5-14`
- Bramka smoke: `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tokeny presetu i zrzuty „przed"

#### Automated

- [x] 1.1 Build przechodzi z nowym `global.css` i zależnościami: `npm run build`
- [x] 1.2 Lint przechodzi: `npm run lint`
- [x] 1.3 Źródło wartości jest w repo: `test -f context/changes/ui-styles-audit/tokens-source/preset-b7Br7G9Kq.global.css`
- [x] 1.4 `--background` nie jest już czerwone: `grep -n -- '--background: oklch(1 0 0)' src/styles/global.css`
- [x] 1.5 `bg-cosmic` zachowane: `grep -n 'utility bg-cosmic' src/styles/global.css`

#### Manual

- [x] 1.6 Zrzuty „przed" (desktop i mobile) istnieją i przedstawiają dotychczasowy signin
- [x] 1.7 Landing `/`, `/dashboard` i `/auth/signup` renderują się poprawnie po zmianie tokenów
- [x] 1.8 Font Outfit ładuje się (Network/Computed w DevTools)

### Phase 2: Komponenty maia w repo

#### Automated

- [ ] 2.1 Wszystkie 5 plików istnieje: `ls src/components/ui/{input,label,card,alert,button}.tsx`
- [ ] 2.2 Brak importów z pakietu `cn`: `! grep -rn 'from "cn"' src`
- [ ] 2.3 Brak martwej zależności: `! grep -rn '@radix-ui/react-slot' src package.json`
- [ ] 2.4 Build i lint przechodzą: `npm run build && npm run lint`

#### Manual

- [ ] 2.5 `git diff --stat` pokazuje zmiany wyłącznie w `src/components/ui/`, `package.json` i `package-lock.json`
- [ ] 2.6 `SubmitButton` nadal się kompiluje i przycisk renderuje się w stylu maia

### Phase 3: Widok signin, komponenty auth i wrapper signup

#### Automated

- [ ] 3.1 Brak klas palety i white/black w zmienianych plikach (grep z planu zwraca puste)
- [ ] 3.2 Brak `useFormStatus`: `! grep -rn 'useFormStatus' src`
- [ ] 3.3 Lint i build przechodzą: `npm run lint && npm run build`

#### Manual

- [ ] 3.4 `/auth/signin` i `/auth/signup` wyglądają spójnie (desktop i ~390 px)
- [ ] 3.5 Klawisz Tab pokazuje widoczny focus na polach, przełączniku hasła, przycisku i linku
- [ ] 3.6 Długie hasło nie wchodzi pod ikonę oka
- [ ] 3.7 Puste pola + submit: komunikaty przy polach, `aria-invalid` obecne w DevTools
- [ ] 3.8 Przy wolnej sieci przycisk pokazuje „Signing in…" i jest nieaktywny
- [ ] 3.9 Powrót przyciskiem „Wstecz" po nieudanym logowaniu nie zostawia przycisku w stanie „Signing in…"

### Phase 4: Punkt wejścia (C3)

#### Automated

- [ ] 4.1 Lint i build przechodzą: `npm run lint && npm run build`
- [ ] 4.2 Smoke przechodzi na działającym dev serwerze z lokalnym Supabase: `npm run smoke`
- [ ] 4.3 Surowy `error.message` nie trafia już do URL: `! grep -n 'error.message' src/pages/api/auth/signin.ts`

#### Manual

- [ ] 4.4 `?error=cokolwiek` nie pokazuje komunikatu; `?error=invalid_credentials` pokazuje stały komunikat
- [ ] 4.5 Złe hasło pokazuje stały komunikat w `Alert`
- [ ] 4.6 Zalogowany wchodzący na `/auth/signin` i `/auth/signup` ląduje na `/dashboard`; `/auth/confirm-email` nadal dostępne
- [ ] 4.7 Po zalogowaniu użytkownik ląduje na `/dashboard`

### Phase 5: Kitchen sink i bramka wizualna

#### Automated

- [ ] 5.1 Lint, build i smoke przechodzą: `npm run lint && npm run build && npm run smoke`
- [ ] 5.2 Kitchen sink zwraca 404 w buildzie produkcyjnym (`npm run preview` + `curl`)
- [ ] 5.3 Zrzuty „po" istnieją: `ls context/changes/ui-styles-audit/screenshots/after-*.png`

#### Manual

- [ ] 5.4 Wszystkie 6 stanów widoczne naraz na kitchen sink (desktop i ~390 px), bez poziomego scrolla
- [ ] 5.5 Hover i focus (Tab) działają na polach, przełączniku, przycisku i linku
- [ ] 5.6 Kontrast tekstu ≥ 4.5:1 wg DevTools; różnice względem „przed" są zamierzone
- [ ] 5.7 `/10x-impl-review` uruchomione; ustalenia UI przeprowadzone przez triage wg wpływu na użytkownika
- [ ] 5.8 `charges.md` zawiera status każdego zarzutu
