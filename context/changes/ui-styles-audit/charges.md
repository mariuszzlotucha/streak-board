# Zarzuty: widok `/auth/signin`

Audyt przed CSS (skill `/10x-ui`). Commit bazowy `ba3915b`; dowody z czytania kodu — **nie** ze screenshotu ani z uruchomienia aplikacji (oznaczone „do potwierdzenia" tam, gdzie zachowanie wynika z wiedzy o bibliotece, a nie z obserwacji).
Kontekst: `research.md` (ta sama zmiana). Motyw: neutralny shadcn (jasny). Dark mode poza zakresem (`.dark` nieaktywne, `research.md` §1).

## C1 — Brakujące tokeny: widok nie czyta żadnego tokenu (kategoria: brakujące tokeny)

- **Dowody:** `signin.astro:10-11,15,17` (`border-white/10 bg-white/10 text-white`, gradient `blue-200→purple-200`, `blue-100/60`, `purple-300`); `FormField.tsx:6,37,41,53,59` (`bg-white/10`, `text-white`, `placeholder-white/40`, `blue-100/80`, `red-400/60`, `purple-400`, `red-300`); `ServerError.tsx:11` (`red-500/30 bg-red-900/30 text-red-300`); `PasswordToggle.tsx:13` (`white/40`, `white/70`); `SubmitButton.tsx:18,22` (`purple-600/500`, `white/30`). Do tego `global.css:8`: `--background` = czerwień (= `--destructive`, l. 22), a `bg-cosmic` (`global.css:113-115`) to gradient na hex.
- **Wpływ na użytkownika:** wygląd formularza logowania nie zależy od motywu; zmiana tokenów nic nie zmienia na ekranie, a `body` (`bg-background`) ma czerwone tło poza wrapperem widoku.
- **Poprawka (kierunek):** widok czyta role: `bg-background`/`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`/`border-input`, `ring-ring`, `text-destructive`, `bg-primary`. Faza tokenów: `--background` → wartość neutralna shadcn (`oklch(1 0 0)`), z linią źródła w `global.css`. **Decyzja do potwierdzenia w planie:** czerwone tło pochodzi z commita `d9de73d` (najpewniej celowego) — cofnięcie jest globalne.

## C2 — Brakujący współdzielony komponent: zduplikowane prymitywy (kategoria: brakujący komponent)

- **Dowody:**
  - `FormField.tsx:5-6,42-55` — własne `<input>` (brak `ui/input`) i `<label>` (`:37`, brak `ui/label`);
  - `SubmitButton.tsx:15-19` — `Button` z nadpisaniem `bg-purple-600 … hover:bg-purple-500` przykrywa wariant `default` (`button.tsx:12`); ręcznie zrobiony spinner `:22` (jest `lucide-react`);
  - `ServerError.tsx:11` — ręczny alert (brak `ui/alert`);
  - `signin.astro:10` — ręczna karta (brak `ui/card`); link „Sign up" `:17` — ręczny styl zamiast `Button variant="link"` (`button.tsx:19`).
- **Wpływ na użytkownika:** pole, przycisk i alert wyglądają i zachowują się inaczej niż reszta systemu (np. focus ring `ring-purple-400` zamiast `--ring`); każdy nowy formularz w M-1 (grupa, task) skopiuje ten wzorzec.
- **Poprawka (kierunek):** `npx shadcn@latest add input card alert` (+ `label`); `SubmitButton` używa `Button` bez nadpisań koloru; `FormField` opakowuje `Input`/`Label`. **Uwaga zależnościowa:** stockowy `label` wymaga `@radix-ui/react-label` (w `package.json` jest tylko `react-slot`) — plan decyduje: dodać zależność albo zostać przy natywnym `<label>` na tokenach.

## C3 — Przypadkowa architektura: punkt wejścia `/auth/signin` (kategoria: przypadkowa architektura)

Sprawdzone: z linku, po błędzie, dla zalogowanego.

- **Dowody i wpływ:**
  1. `middleware.ts:4,18-22` chroni tylko `/dashboard`; zalogowany użytkownik wchodzący na `/auth/signin` widzi formularz ponownie. Po udanym logowaniu redirect idzie na `/` (`api/auth/signin.ts:19`), czyli do landingu z hero, a nie do aplikacji.
  2. `signin.astro:5,14` renderuje dowolny tekst z `?error=` w karcie logowania; `api/auth/signin.ts:16` przekazuje surowe `error.message` Supabase. Wpływ: każdy może podesłać link z dowolnym komunikatem w wiarygodnej ramce logowania (React escapuje, więc to spoofing treści, nie XSS).
  3. `api/auth/signin.ts:16` przekierowuje bez adresu e-mail, a formularz jest w całości po stronie klienta (`SignInForm.tsx:13-14`) — po błędnym haśle pole e-mail jest puste.
- **Poprawka (kierunek):** to poprawki punktu wejścia (guard/redirect, mapowanie kodów błędów na stałe komunikaty, ewentualnie zachowanie e-maila), nie koloru. Częściowo wychodzą poza „styl" — plan rozstrzyga, które wchodzą do tej zmiany, a które są odroczone.

## C4 — Stany i a11y: widoczne tylko na szczęśliwej ścieżce (sekcja *Stany*, poza trzema kategoriami)

- **Dowody (czytanie kodu):**
  - `FormField.tsx:42-62` — komunikat błędu (`<p>`) nie jest powiązany z polem (brak `aria-invalid`, `aria-describedby`); `ServerError.tsx:11` bez `role="alert"`;
  - `FormField.tsx:6,56` + `PasswordToggle.tsx:13` — input ma `pl-10`, ale nie `pr-*`, a przełącznik hasła leży absolutnie po prawej: długie hasło wchodzi pod ikonę;
  - `SubmitButton.tsx:12,17` — stan `loading` z `useFormStatus`, a formularz to natywny `method="POST" action="/api/auth/signin"` (`SignInForm.tsx:43`), nie React action; **do potwierdzenia w przeglądarce**, czy `pending` kiedykolwiek jest `true` (wg dokumentacji React 19 `pending` dotyczy formularzy z funkcją w `action`);
  - kontrast: `text-white/40` (ikony, placeholder) i `blue-100/60` na `white/10` — niezmierzony, do sprawdzenia po przejściu na tokeny.
- **Wpływ na użytkownika:** czytnik ekranu nie zapowiada błędów; hasło przesłania ikona; przy wolnej sieci przycisk może nie pokazywać „Signing in…" (możliwy podwójny submit).
- **Stany do pokrycia w kitchen sink:** default, hover, focus, disabled, error (pole), error (serwer), loading, empty (puste pola); desktop + 1 szerokość mobilna.

## Ryzyka dla planu (nie zarzuty)

- **Kolizja zakresu ze `signup`:** `SignUpForm.tsx:3-6` importuje te same `FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`. Po przejściu tych komponentów na tokeny jasnego motywu `signup.astro:9-10` (nadal `bg-cosmic`, `text-white`, `bg-white/10`) dostanie jasne pola na ciemnej karcie. Plan musi zdecydować: (a) mała podmiana wrappera `signup.astro` (te same ~4 linie co w signin) w tej zmianie, albo (b) świadomie zostawić signup zepsuty do następnej zmiany — rekomendacja: (a), inaczej powstaje regresja.
- **Bramka wizualna:** `CLAUDE.md` — brak runnera testów poza `npm run smoke`, więc bramka = strona kitchen sink + screenshoty. Strona nie może trafić na produkcję Cloudflare Workers jako publiczna trasa (np. tylko `import.meta.env.DEV` albo poza `src/pages`).
- **`--background` czerwone** wpływa globalnie (`body`); po zmianie sprawdzić Welcome/dashboard.

## Status po implementacji (fazy 1–5)

| Zarzut | Status | Uzasadnienie / dowód |
| --- | --- | --- |
| C1 — brakujące tokeny | załatwiony | `global.css` z tokenami presetu `b7Br7G9Kq`; widok, `FormField`, `ServerError`, `PasswordToggle`, `SubmitButton` czytają role semantyczne (grep bez klas palety w `signin.astro`, `signup.astro`, `src/components/auth`); `--background` białe. Zrzuty `screenshots/after-*.png`. |
| C2 — brakujące komponenty | załatwiony | `Card`, `Input`, `Label`, `Alert`, `Button` z `radix-maia` w `src/components/ui/`; `SubmitButton` bez nadpisań koloru; brak własnych prymitywów. Etykieta: `radix-ui` zamiast dodatkowego `@radix-ui/react-label`. |
| C3 — punkt wejścia | załatwiony (pkt 1–2), odroczony (pkt 3) | Guard `AUTH_ROUTES` w `middleware.ts`, redirect po logowaniu na `/dashboard`, `?error=` mapowane na stałe kody (`src/lib/auth-errors.ts`); pokryte przez `npm run smoke`. Pkt 3 (zachowanie e-maila po błędnym logowaniu) odroczony: wymaga decyzji o miejscu przechowania. `signup` bez mapowania `?error=` — odroczone. |
| C4 — stany i a11y | załatwiony | `aria-invalid`/`aria-describedby`, `role="alert"` z `Alert`, `pr-10` chroni przed przełącznikiem hasła, jawny `pending` (reset w `pageshow`), focus z tokenu `--ring`. Kitchen sink (`/dev/signin-kitchen-sink`, tylko dev): 6 stanów; zrzuty desktop, mobile i focus. |

Nadal odroczone: sekcja poniżej.

## Odroczone (widoczne, nie usunięte)

- `Banner.astro:28-40` — 9 literałów hex dla wariantów info/warning/error; renderuje się nad każdym widokiem (`Layout.astro`), gdy brakuje konfiguracji. Powód: osobny komponent layoutu; wymaga tokenów `--success/--warning/--info`.
- Restyl `dashboard.astro`, `confirm-email.astro`, `Welcome.astro`, `Topbar.astro`, `LibBadge.astro` — poza „jednym widokiem".
- Dark mode (aktywacja `.dark`, przełącznik) — wybrano jasny motyw.
- Tokeny `--success`/`--warning` i prymitywy widoku grupy (`research.md` §5) — potrzebne dopiero w M-1.
