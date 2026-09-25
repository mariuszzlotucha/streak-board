---
date: 2026-09-25T12:59:07+02:00
researcher: Claude (Sonnet 5) dla Mariusz Złotucha
git_commit: ba3915bf2a4c715d5db65a8ee834350499c60be9
branch: master
repository: 10xDevs
topic: "Konfiguracja stylów i użycie klas kolorów (tokeny vs. twardo zakodowane)"
tags: [research, codebase, tailwind, shadcn, design-tokens, ui]
status: complete
last_updated: 2026-09-25
last_updated_by: Claude (Sonnet 5)
---

# Research: Konfiguracja stylów i użycie klas kolorów

**Date**: 2026-09-25T12:59:07+02:00
**Researcher**: Claude (Sonnet 5)
**Git Commit**: ba3915bf2a4c715d5db65a8ee834350499c60be9
**Branch**: master
**Repository**: 10xDevs

## Research Question

Przeanalizuj konfigurację stylów i użycie klas w tym projekcie. Wypisz:

1. dokładną ścieżkę do głównego pliku stylów oraz listę zmiennych w `:root` i `.dark`;
2. zmienne poprawnie publikowane w `@theme` / `@theme inline`;
3. komponenty fizycznie obecne w `src/components/ui`;
4. pliki w `src` używające twardo zakodowanych klas kolorów zamiast klas semantycznych;
5. brakujące prymitywy UI niezbędne do wyświetlenia danych w docelowym widoku.

Bez zmian w plikach źródłowych (zapisany został wyłącznie ten dokument i `change.md` zmiany `ui-styles-audit`).

## Summary

- **Jedyny plik CSS w `src`** to `src/styles/global.css` (`find src -name "*.css"` → 1 wynik); importuje go `src/layouts/Layout.astro:2` i wskazuje `components.json` (`tailwind.css`). Definiuje 32 zmienne w `:root` i 31 w `.dark` (jedyna różnica: `--radius` tylko w `:root`).
- **`@theme inline`** (`global.css:75-111`) publikuje 31 wpisów `--color-*` (po jednym na każdą zmienną kolorystyczną `:root`, mapowanie 1:1 `var(--X)`) oraz 4 pochodne `--radius-{sm,md,lg,xl}`. Nie ma zmiennych `:root` bez publikacji ani publikacji bez zmiennej.
- **`src/components/ui`** zawiera dokładnie 2 pliki: `button.tsx` (shadcn) i `LibBadge.astro` (nie shadcn, nieimportowany nigdzie w `src`).
- **Tokeny semantyczne są w praktyce używane tylko przez `button.tsx`** (+ `@layer base` w `global.css`). Spośród 17 plików `.astro`/`.tsx` w `src` 12 używa twardo zakodowanych klas palety Tailwind i/lub `white`/`black` (bez `button.tsx`), a 1 dodatkowy (`Banner.astro`) — literałów hex w scoped CSS; razem 13 plików z twardymi kolorami poza `button.tsx` (szczegóły w pkt 4). Cały istniejący UI (auth, dashboard, landing) jest stylowany stałym „kosmicznym" ciemnym motywem (`bg-cosmic`, `white/10`, `blue-100/*`, `purple-*`), niezależnym od tokenów.
- **Dwie anomalie warte zaadresowania w planie**: `--background` w `:root` ma tę samą wartość co `--destructive` (czerwień), a klasa `.dark` nie jest nigdzie ustawiana w `src`.
- **Brakujące prymitywy** dla widoku grupy/tasków/tablicy wyników (założenie: patrz pkt 5): Card, Badge, Table/lista, Checkbox/przełącznik, Input+Label (jako współdzielone), Dialog/AlertDialog, Select, Avatar, Skeleton, toast oraz tokeny statusu (success/warning). Zainstalowana jest tylko zależność `@radix-ui/react-slot`.

## Detailed Findings

### 1. Główny plik stylów i zmienne `:root` / `.dark`

- Ścieżka: `src/styles/global.css` (jedyny plik `*.css` pod `src`). Importowany w `src/layouts/Layout.astro:2` (`import "../styles/global.css"`); `components.json` wskazuje ten sam plik (`tailwind.css: "src/styles/global.css"`, `baseColor: "neutral"`, `cssVariables: true`, styl `new-york`).
- Nagłówek pliku: `@import "tailwindcss"`, `@import "tw-animate-css"`, `@custom-variant dark (&:is(.dark *))` (`global.css:1-4`).
- **`:root`** (`global.css:6-39`, 32 zmienne): `--radius`; `--background`, `--foreground`; `--card`, `--card-foreground`; `--popover`, `--popover-foreground`; `--primary`, `--primary-foreground`; `--secondary`, `--secondary-foreground`; `--muted`, `--muted-foreground`; `--accent`, `--accent-foreground`; `--destructive`; `--border`, `--input`, `--ring`; `--chart-1`…`--chart-5`; `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`.
- **`.dark`** (`global.css:41-73`, 31 zmiennych): ten sam zestaw co `:root` bez `--radius`. Wartości zmienione względem `:root` m.in. `--background` (`oklch(0.145 0 0)`), `--border`/`--input` (kanał alfa `10%`/`15%`), `--chart-*`.
- Zestaw pozostałych elementów: `@utility bg-cosmic` (`global.css:113-115`) z gradientem na literałach hex (`#0a0e1a`, `#0f1529`) oraz `@layer base` (`global.css:117-124`: `border-border outline-ring/50` na `*`, `bg-background text-foreground` na `body`).
- **Anomalia A — `--background` = czerwień**: `:root --background: oklch(0.577 0.245 27.325)` (`global.css:8`) jest identyczne z `--destructive` (`global.css:22`); w domyślnym szablonie shadcn to zwykle `oklch(1 0 0)`. Historia git: commit `d9de73d` „Change app background color to red" (zmiana wprowadzona świadomie, cel niezweryfikowany). Skutek wizualny nie był sprawdzany w przeglądarce; strony z `bg-cosmic` (signin/signup/confirm-email/dashboard/Welcome) przykrywają `body` wrapperem `min-h-screen`.
- **Anomalia B — brak przełącznika ciemnego motywu**: w `src` nie ma `classList`, `class="dark"` ani `className="dark"`; `<html lang="en">` (`Layout.astro:14`) bez klasy. Jedyne użycia wariantu `dark:` to `button.tsx:8,14,16,18`. Wniosek (dotyczy `src`, wyszukiwanie po tych wzorcach): blok `.dark` jest obecnie nieaktywny.
- Brak zmiennych `--destructive-foreground`, `--success`, `--warning`, `--info` w `:root` i `.dark` (żadnej z nich nie znaleziono w pliku); `button.tsx:14` używa dlatego `text-white` dla wariantu destructive.

### 2. Zmienne publikowane w `@theme inline`

- Blok `@theme inline` (`global.css:75-111`): 4 wpisy `--radius-{sm,md,lg,xl}` (kalkulacje z `var(--radius)`, `global.css:76-79`) i 31 wpisów `--color-*` (`global.css:80-110`).
- Kontrola programowa (skrypt Python na treści pliku, tej wersji): każdy wpis `--color-X` ma wartość dokładnie `var(--X)`; zbiór `X` = 31 zmiennych `:root` poza `--radius`; różnica zbiorów w obu kierunkach jest pusta. `--radius` nie jest publikowany wprost — tylko przez 4 pochodne.
- Wariant `inline` sprawia, że wygenerowane utility (np. `bg-primary`) odwołują się bezpośrednio do `var(--primary)`, więc nadpisania w `.dark` działają bez dodatkowych reguł (własność wariantu `@theme inline` w Tailwind 4; niesprawdzana uruchomieniem buildu w tym badaniu).
- Nie są publikowane (bo nie istnieją): tokeny fontów, cieni, spacingu, kolory statusu (success/warning/info), `--color-destructive-foreground`.
- Poprawnie publikowane a używane: patrz pkt 4 — z 31 opublikowanych klas kolorów faktycznie konsumuje je tylko `button.tsx` i `@layer base`.

### 3. Komponenty w `src/components/ui`

Dokładnie 2 pliki (`ls src/components/ui`):

- `button.tsx` — shadcn „new-york", `cva` z wariantami `default|destructive|outline|secondary|ghost|link` i rozmiarami `default|sm|lg|icon`, `asChild` przez `@radix-ui/react-slot`, `cn()` z `@/lib/utils`. Jedyny konsument: `src/components/auth/SubmitButton.tsx:3`, który nadpisuje wygląd klasami `bg-purple-600 … hover:bg-purple-500` (`SubmitButton.tsx:18`).
- `LibBadge.astro` — komponent Astro (`label`, `version?`), klasy `bg-blue-900/50 text-blue-200`, `bg-purple-500/30 text-purple-200`. Wyszukiwanie `LibBadge` w `src` zwraca wyłącznie jego własny plik → brak importów. Nie jest komponentem shadcn.
- Inne komponenty poza `ui/`: `src/components/auth/{FormField,PasswordToggle,ServerError,SignInForm,SignUpForm,SubmitButton}.tsx`, `Banner.astro`, `Topbar.astro`, `Welcome.astro` — własne implementacje pól, błędów i przycisków, nieoparte na `ui/`.
- Zależności UI w `package.json`: z `@radix-ui/*` tylko `@radix-ui/react-slot` (`package.json:21`); ponadto `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`. Brak m.in. `sonner`, `@tanstack/*`, `recharts`, `date-fns` (wzorzec wyszukiwania: nazwy z przedrostkami użytymi w grepie).

### 4. Pliki z twardo zakodowanymi kolorami

Metoda: `grep` po `src` (pliki `.astro`/`.tsx`); liczby to dopasowania wzorca (`-o`), więc `hover:text-purple-100` i `text-purple-300` w jednej linii liczą się osobno. „Paleta" = `(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration|placeholder)-<kolor Tailwind>-<2–3 cyfry>`; „white/black" = te same prefiksy (bez `shadow|decoration`) z `white|black`, także z `/alfa`.

| Plik | Paleta | white/black | Uwagi (linie) |
| --- | --: | --: | --- |
| `src/components/Welcome.astro` | 16 | 10 | `purple/blue/indigo` orby (7-9), `bg-red-600` na hero (21), gradient `blue→purple→pink` (22), CTA `purple-600` (31), inline `rgba(...)` gwiazd (14) |
| `src/components/Topbar.astro` | 10 | 2 | `blue-100/70`, `purple-300 hover:purple-100` (8-27) |
| `src/components/auth/FormField.tsx` | 5 | 4 | stała bazowa z `bg-white/10`, `text-white` (6), `border-red-400/60`, `focus:ring-purple-400` (53), etykieta `blue-100/80` (37), komunikat `red-300` (59) |
| `src/pages/dashboard.astro` | 4 | 5 | karta `white/10`, gradient nagłówka, `blue-100/*` (9-20) |
| `src/pages/auth/signin.astro` | 4 | 2 | (9-17) |
| `src/pages/auth/signup.astro` | 4 | 2 | (9-17) |
| `src/pages/auth/confirm-email.astro` | 4 | 2 | (22-29) |
| `src/components/ui/LibBadge.astro` | 4 | 0 | `blue-900/50`, `blue-200`, `purple-500/30`, `purple-200` (10-12) |
| `src/components/auth/ServerError.tsx` | 3 | 0 | `border-red-500/30 bg-red-900/30 text-red-300` (11) |
| `src/components/auth/SubmitButton.tsx` | 2 | 2 | `bg-purple-600 hover:bg-purple-500 text-white` (18), spinner `white/30` (22) |
| `src/components/auth/SignUpForm.tsx` | 1 | 0 | `text-blue-100/50` (59) |
| `src/components/auth/PasswordToggle.tsx` | 0 | 2 | `text-white/40 hover:text-white/70` (13) |
| `src/components/ui/button.tsx` | 0 | 1 | `text-white` w wariancie destructive (14) — wzorzec ze stockowego shadcn |

Razem: 11 plików z klasami palety (57 dopasowań łącznie) oraz 10 plików z `white`/`black` (32 dopasowania łącznie); w sumie 13 plików z co najmniej jednym trafieniem palety lub white/black (w tym `button.tsx`, gdzie trafienie to tylko `text-white`).

Poza klasami Tailwinda (literały kolorów):

- `src/components/Banner.astro:28-40` — 9 linii z literałami hex w scoped CSS (`#dbeafe`, `#1e3a8a`, `#3b82f6`, `#fef3c7`, `#78350f`, `#f59e0b`, `#fee2e2`, `#7f1d1d`, `#dc2626`) dla wariantów `info|warning|error`; używany w `Layout.astro`.
- `src/components/Welcome.astro:14` — inline `style` z `rgba(255,255,255,…)`.
- `src/styles/global.css:114` — gradient `bg-cosmic` na hex.
- W `src` nie znaleziono arbitralnych wartości kolorów typu `bg-[#…]` (wzorzec `(bg|text|border|ring)-\[` trafia tylko w `button.tsx:8` — `ring-[3px]`, szerokość, nie kolor).

Pliki bez trafień kolorystycznych: `SignInForm.tsx`, `Layout.astro`, `index.astro` oraz cały kod `.ts` (`lib`, `middleware`, `pages/api`).

Konsumenci klas semantycznych (`bg|text|border|ring|outline` + nazwa tokenu; 26 dopasowań w `button.tsx`, 4 w `global.css:119,122`): w `src` znaleziono je tylko w tych dwóch plikach. Żaden plik `.astro` ani inny `.tsx` nie używa `bg-primary`, `text-muted-foreground` itp.

Wzorzec dominujący w plikach niesemantycznych: „szkło na ciemnym gradiencie" — karta `border-white/10 bg-white/10 backdrop-blur-xl`, tekst `blue-100/{50..80}`, akcent `purple-300/600`, błąd `red-300/400/500`. Odpowiadające tokeny semantyczne (`card`, `muted-foreground`, `primary`, `destructive`, `border`) istnieją, ale ich wartości w `:root` są jasne (neutralne szarości), więc proste podmienienie klas zmieniłoby wygląd — decyzja co do motywu należy do planu.

### 5. Brakujące prymitywy UI dla docelowego widoku

**Założenie (wymaga potwierdzenia)**: polecenie nie wskazuje widoku; przyjęto widok z roadmapy M-1 (`context/foundation/roadmap.md`, S-01…S-04, FR-002…FR-009, US-01): widok grupy z listą tasków, akcją odznaczenia „wykonane" i tablicą wyników (pozycja wg sumy streaków, `prd.md:95-97`), użyteczny na smartfonie (`prd.md:93`). Poniższa lista to **wniosek** z tych wymagań, nie zaobserwowany kod (widok jeszcze nie istnieje: `dashboard.astro` to karta powitalna z przyciskiem wylogowania).

Obecne: `Button` (`ui/button.tsx`), `cn()` (`src/lib/utils.ts`), ikony `lucide-react`.

| Potrzeba widoku | Prymityw | Stan |
| --- | --- | --- |
| Kontener grupy/tasku | Card | brak w `ui/` |
| Wiersze tablicy wyników (pozycja, członek, suma streaków) | Table lub lista + Avatar | brak |
| Streak, cykliczność (dziennie/tygodniowo), oznaczenie twórcy | Badge | brak (`LibBadge.astro` nieużywany, twardo kodowane kolory) |
| Odznaczenie „wykonane" (FR-008) | Checkbox lub przełącznik | brak; alternatywnie `Button` wariant `outline`/`icon` |
| Formularze grupy/tasku, kod dołączenia (FR-002, FR-004) | Input + Label | brak w `ui/`; istnieje `auth/FormField.tsx` z twardymi kolorami |
| Wybór cykliczności (FR-004) | Select / RadioGroup | brak |
| Potwierdzenia usunięcia grupy/członka/tasku (FR-003, FR-005) | AlertDialog / Dialog | brak |
| Menu akcji na wierszu (edytuj/usuń, FR-005) | DropdownMenu | brak (opcjonalne) |
| Stan ładowania / pusta grupa | Skeleton, komponent Empty | brak |
| Potwierdzenie natychmiastowego odznaczenia (guardrail, roadmap S-04) | Toast (np. `sonner`) | brak zależności |
| Kolory „zielony/czerwony" siatki (`prd.md:20`) | tokeny `--success`/`--warning` (+ `-foreground`) | brak w `:root` i `.dark`; są tylko `--destructive` i `--chart-*` |

Uwaga zależnościowa: Dialog/AlertDialog/Select/Checkbox/DropdownMenu ze stockowego shadcn wymagają pakietów `@radix-ui/*`, których w `package.json` nie ma (poza `react-slot`); Card, Badge, Table, Input, Label, Skeleton, Avatar (bez obrazu) są czysto stylowe. Do rozstrzygnięcia w `/10x-plan`.

## Code References

- `src/styles/global.css:6-39` — `:root` (32 zmienne)
- `src/styles/global.css:41-73` — `.dark` (31 zmiennych)
- `src/styles/global.css:75-111` — `@theme inline` (31 × `--color-*`, 4 × `--radius-*`)
- `src/styles/global.css:8` vs `:22` — `--background` i `--destructive` mają tę samą wartość
- `src/styles/global.css:113-115` — `@utility bg-cosmic` (hex)
- `src/layouts/Layout.astro:2` — import `global.css`; `:14` — `<html>` bez klasy `dark`
- `components.json` — konfiguracja shadcn (`new-york`, `baseColor: neutral`, aliasy)
- `src/components/ui/button.tsx:7-33` — warianty `cva` na tokenach semantycznych; `:14` — `text-white`
- `src/components/auth/SubmitButton.tsx:3,18` — jedyny import `Button` i nadpisanie klasami `purple-*`
- `src/components/ui/LibBadge.astro:10-12` — nieużywany, twarde kolory
- `src/components/Banner.astro:28-40` — literały hex dla wariantów bannera
- `src/components/Welcome.astro:14,21` — inline `rgba`, `bg-red-600`
- `src/components/auth/FormField.tsx:6,37,53,59` — własna baza pola z twardymi kolorami
- `context/foundation/roadmap.md` (§Baseline, §Slices S-01…S-04) — źródło założenia o docelowym widoku
- `context/foundation/prd.md:20,93,95-97` — siatka zielony/czerwony, wymóg mobilny, reguła streaka

## Architecture Insights

- Kontrakt tokenów jest kompletny na poziomie plumbingu (`:root` → `.dark` → `@theme inline` bez luk i osieroconych wpisów), ale **niewykorzystany**: warstwa widoków całkowicie go omija. W kategoriach 10x-ui: dominują zarzuty „przypadkowa architektura" (kolory wpisane w widokach) i „brakujący współdzielony komponent" (pole, błąd, karta, badge powielone jako klasy); „brakujące tokeny" dotyczą statusów (success/warning) i `destructive-foreground`.
- Dwie równoległe konwencje: shadcn (`ui/button.tsx`, semantyczne) i „cosmic glass" (klasy palety inline). `SubmitButton` łączy obie, nadpisując wariant `default` klasami palety.
- Motyw ciemny „na sztywno" (`bg-cosmic`, `text-white`) współistnieje z jasnymi wartościami `:root`; `.dark` nieaktywne. Wybór, czy istniejący cosmic-look staje się motywem (tokeny), czy jest porzucany, jest decyzją produktową/projektową — nie technicznym faktem.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md` §Baseline — „jeden komponent shadcn/ui (`src/components/ui/button.tsx`)": zgodne ze stanem kodu co do shadcn (1 komponent); nie wspomina `LibBadge.astro` w `ui/` (uzupełnienie, nie sprzeczność).
- Git: `d9de73d` „Change app background color to red" oraz `99cc8f0` (m.in. „red hero background") wprowadziły odpowiednio czerwone `--background` i `bg-red-600` w `Welcome.astro`; przypuszczalnie celowe (komunikaty commitów), lecz cel nie jest udokumentowany w `context/`.
- `grep "research|kitchen"` w `context/archive/` nie zwraca dopasowań; `context/changes/deployment` i `bootstrap-verification` nie dotyczą stylów. Brak `context/foundation/lessons.md` w repozytorium (plik nie istnieje).

## Related Research

Brak (nie dotyczy): w `context/changes/**` i `context/archive/**` nie znaleziono wcześniejszego `research.md` o stylach.

## Open Questions

1. **Który widok jest „docelowy"?** Pkt 5 opiera się na założeniu (widok grupy/tasków/tablicy wyników z M-1). Jeśli chodzi o inny widok (np. tylko dashboard lub auth), lista prymitywów się zmieni.
2. Czy czerwone `--background` (`global.css:8`) i `bg-red-600` w `Welcome.astro:21` są celowe (ćwiczenie kursowe?) czy do usunięcia w ramach zmiany wizualnej?
3. Czy cosmic-look ma zostać przeniesiony do tokenów (motyw ciemny jako domyślny), czy widok docelowy ma przejść na jasne wartości `:root`? Wpływa na to, czy `.dark` ma być aktywowane (brak przełącznika w `src`).
4. Nie uruchamiano `npm run build`, przeglądarki ani zrzutów ekranu — skutki wizualne (np. czerwone tło `body`) pozostają niezweryfikowane; wyniki grepów dotyczą wyłącznie `src` na commicie `ba3915b`.
