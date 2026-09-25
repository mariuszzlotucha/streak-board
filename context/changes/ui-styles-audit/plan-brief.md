# Signin: tokeny presetu shadcn i komponenty z `ui/` — Plan Brief

> Full plan: `context/changes/ui-styles-audit/plan.md`
> Research: `context/changes/ui-styles-audit/research.md`
> Zarzuty (audyt widoku): `context/changes/ui-styles-audit/charges.md`

## What & Why

Widok `/auth/signin` (i wrapper `signup`, który współdzieli komponenty) ma czytać tokeny semantyczne i komponenty `ui/` zamiast literałów „cosmic glass". Dziś kontrakt tokenów istnieje (`global.css`), ale żaden widok go nie czyta, a prymitywy (pole, alert, karta, przycisk) są zduplikowane w plikach widoków. Źródłem wartości jest preset shadcn `b7Br7G9Kq`.

## Starting Point

`global.css` ma kompletne `:root`/`.dark`/`@theme inline` z neutralnymi wartościami i czerwonym `--background`; w `ui/` jest tylko `button.tsx` (new-york). Signin i komponenty `auth/*` stoją na klasach `white/*`, `purple-*`, `blue-100/*`, `red-*`. Punkt wejścia ma luki: brak guardu dla zalogowanych, redirect na `/`, surowy `?error=` w karcie, a stan `loading` zależy od `useFormStatus` przy natywnym `POST`.

## Desired End State

`/auth/signin` i `/auth/signup` wyglądają spójnie w jasnym motywie presetu (font Outfit, szmaragdowy `primary`), wyłącznie z klas semantycznych i komponentów `Card`/`Input`/`Label`/`Alert`/`Button`. Formularz jest dostępny (`aria-*`, widoczny focus, przełącznik hasła nie zasłania tekstu), zalogowany użytkownik nie widzi logowania, a `?error=` pokazuje tylko znane komunikaty. Kitchen sink (dev-only) i zrzuty desktop + mobile dokumentują stany.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Widok i motyw | `/auth/signin`; preset shadcn `b7Br7G9Kq` (zastąpił wcześniejszy „neutralny shadcn") | Preset podał użytkownik jako źródło wartości. | Plan |
| Integracja presetu | Ręczny transplant tokenów + `components.json` na `radix-maia`/`mist` + `shadcn add … --overwrite`; **bez** `shadcn init` | `init` nadpisałby istniejący system, co zabrania kontrakt `/10x-ui`. | Plan |
| Font | Dołączyć Outfit Variable (globalnie) | Wierne odwzorowanie presetu; font jako token. | Plan |
| Signup | Podmienić wrapper `signup.astro` w tej zmianie | Współdzielone komponenty zepsułyby signup na ciemnej karcie. | Plan |
| Tło | `--background` → `oklch(1 0 0)` (globalnie) | Zgodne z presetem; usuwa czerwone tło z commita `d9de73d`. | Plan |
| Punkt wejścia | Guard + stałe komunikaty błędów + redirect na `/dashboard`; e-mail po błędzie odroczony | Domyka spoofing `?error=` bez wchodzenia w decyzję o przechowaniu e-maila. | Plan |
| Stan `pending` | Jawna propsa sterowana stanem formularza (bez `useFormStatus`) | `useFormStatus` prawdopodobnie nie działa przy natywnym `POST`. | Plan |
| Bramka wizualna | Trasa dev-only `/dev/signin-kitchen-sink` (404 w produkcji) | Repo nie ma runnera screenshotów; Playwright poza zakresem. | Plan |
| Zakres audytu | 4 zarzuty (C1–C4) z `charges.md` | Lista zarzutów przed CSS wg `/10x-ui`. | Research |

## Scope

**In scope:** tokeny presetu w `global.css`; `input`/`label`/`card`/`alert`/`button` (maia); signin + `auth/*` + wrapper signup; guard, mapowanie błędów, redirect po logowaniu; smoke; kitchen sink i zrzuty.

**Out of scope:** `shadcn init`; dark mode; restyl `dashboard`/`confirm-email`/landing/`Topbar`/`LibBadge`/`Banner`; `?error=` na signup; zachowanie e-maila; walidacja serwerowa; Playwright; tokeny `success`/`warning`; prymitywy widoku grupy (M-1).

## Architecture / Approach

Kontrakt przed pikselami: (1) jedno źródło tokenów z presetu (surowe wartości w `tokens-source/`), (2) komponenty maia w `ui/`, (3) jeden widok i współdzielone komponenty auth, (4) poprawki punktu wejścia (middleware, `src/lib/auth-errors.ts`, endpoint, smoke), (5) kitchen sink jako bramka. Reszta aplikacji nie czyta tokenów, więc globalne zmiany dotykają jej tylko przez font i tło `body`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tokeny presetu + zrzuty „przed" | `global.css` z presetu, zależności, `components.json` | Nowe zależności (`radix-ui`, `shadcn`, Outfit) i build z `shadcn/tailwind.css` |
| 2. Komponenty maia | `input`/`label`/`card`/`alert`/`button` w `ui/` | Importy `cn` z pakietu zamiast `@/lib/utils`; zmiana wyglądu `Button` |
| 3. Widok + auth + signup | Signin/signup na tokenach i komponentach, a11y, `pending` | Regresja signup przez współdzielone komponenty |
| 4. Punkt wejścia | Guard, stałe błędy, redirect `/dashboard`, smoke | Zmiana zachowania auth (nie tylko stylu); smoke wymaga lokalnego Supabase |
| 5. Kitchen sink + bramka | Trasa dev, zrzuty „po", kontrast, `/10x-impl-review` | Trasa dev nie może być serwowana w produkcji |

**Prerequisites:** Node 22 (`.nvmrc`), dostęp do sieci dla `shadcn`/`npm`, lokalny Supabase (README) dla `npm run smoke`, przeglądarka do zrzutów.
**Estimated effort:** ~3–4 sesje w 5 fazach (fazy 1–2 małe, 3 największa).

## Open Risks & Assumptions

- `shadcn add` z rejestru może dać komponenty nieznacznie różne od tych z katalogu tymczasowego (wersja CLI 4.21.0 przy badaniu); fazy 2 i weryfikacja `cn` to łapią.
- `useFormStatus` przy natywnym `POST` nie było weryfikowane w przeglądarce; plan zakłada, że go nie potrzebujemy.
- Kontrast i wygląd presetu nie były oglądane w tej aplikacji; potwierdza je faza 5.
- Smoke zakłada lokalny Supabase bez wymogu potwierdzenia e-maila (jak dotychczas).

## Success Criteria (Summary)

- Signin i signup nie zawierają klas palety ani `white`/`black`; wszystko z tokenów i `ui/`.
- Formularz jest użyteczny z klawiatury i czytnika ekranu, a stan ładowania działa.
- `npm run lint`, `npm run build`, `npm run smoke` przechodzą; kitchen sink zwraca 404 w buildzie produkcyjnym; zrzuty „przed"/„po" leżą w folderze zmiany.
