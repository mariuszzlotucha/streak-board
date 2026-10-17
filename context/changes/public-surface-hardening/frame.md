# Frame Brief: Utwardzenie publicznej powierzchni

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

W logach Cloudflare z 2026-10-17 widać `GET /wp-admin/install.php?step=1` (dwa razy), `/robots.txt` i `/`. Sprawdzenie produkcji tego samego dnia: `https://streakboard.app/` nie wysyła żadnego nagłówka bezpieczeństwa (HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), `streakboard.app` nie ma rekordu SPF ani `_dmarc`, a `/.well-known/security.txt` zwraca 404.

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: publiczna powierzchnia aplikacji jest „nieutwardzona”.
- **Proponowany przez użytkownika kierunek**: nagłówki bezpieczeństwa w middleware, CSP najpierw w trybie Report-Only, `security.txt`, opcjonalnie własny `robots.txt`; w Cloudflare HSTS, SPF `v=spf1 -all`, DMARC `p=reject` i reguła WAF na `/wp-*` i `*.php`.
- **Zawężenie przed delegowaniem**: wszystkie trzy obawy (nagłówki, podszywanie się w poczcie, skany botów) są dla właściciela równie ważne, bo jeszcze ich nie rozdzielił. Domena wysyła pocztę przez własny SMTP. Właściciel nie jest pewien, czy `robots.txt` i reguła WAF należą do zakresu.

## Mapa wymiarów

1. **Nagłówki odpowiedzi SSR**: aplikacja nie ustawia żadnego nagłówka bezpieczeństwa. ← początkowe ujęcie
2. **Uwierzytelnienie poczty domeny**: brak SPF i DMARC pozwala podszyć się pod domenę, a źle dobrane wartości mogą odciąć maile z potwierdzeniem rejestracji.
3. **Ekspozycja na skany**: skany `/wp-*` mogłyby trafiać w realną powierzchnię aplikacji.
4. **Zgodność CSP z działającą aplikacją**: skrypty inline, wyspy React, przekierowanie do Google OAuth, service worker i push mogą się zepsuć pod ścisłą polityką.

## Badanie hipotez

| Hipoteza                                      | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Werdykt                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1. Brak nagłówków                             | `curl -sI https://streakboard.app/` nie zwraca żadnego z sześciu nagłówków; `grep` w `src/` nie znajduje `X-Frame`, `Content-Security` ani `headers.set` dla nich; `public/_headers` ustawia tylko cache dla `sw.js` i manifestu                                                                                                                                                                                                                                    | SILNE                                          |
| 2. Poczta: brak ochrony _i_ ryzyko `p=reject` | README.md:353–355: Resend wysyła z subdomeny `mail.streakboard.app` (`noreply@mail.streakboard.app`); `send.mail.streakboard.app` ma MX i własny SPF (`~all`), `resend._domainkey.mail.streakboard.app` ma DKIM; korzeń `streakboard.app` nie ma MX ani SPF, więc nic nie wysyła z korzenia; `_dmarc.streakboard.app` i `_dmarc.mail.streakboard.app` są puste. DMARC z korzenia obejmuje subdomeny (domyślne `sp` = `p`), więc `p=reject` dotyczy też maili Resend | SILNE (oba kierunki)                           |
| 3. Skany trafiają w aplikację                 | `https://streakboard.app/wp-admin/install.php` zwraca 404 (`src/pages/404.astro`); `/wp-` nie ma w `PROTECTED_ROUTES` i nie dotyka Supabase                                                                                                                                                                                                                                                                                                                         | BRAK. Skany to tylko szum                      |
| 4. CSP może zepsuć aplikację                  | `src/components/site/ClearErrorParam.astro:7` to `<script is:inline>`; wyspy React (`RemindersToggle`) hydratują przez skrypty inline `astro-island`; logowanie Google to formularz POST do `/api/auth/google` z przekierowaniem 302 do Google, a Chromium stosuje `form-action` także do celu przekierowania; Sentry działa po stronie serwera (`src/lib/sentry-options.ts`), a strona główna nie ładuje zewnętrznych originów                                     | SILNE (ryzyko dla planu, nie przeformułowanie) |

## Sygnały zawężające

- Domena wysyła pocztę, ale wyłącznie z `mail.streakboard.app`, uwierzytelnioną przez SPF i DKIM Resend. `v=spf1 -all` na korzeniu jest więc bezpieczny. DMARC na korzeniu nie jest neutralny dla Resend, bo obejmuje subdomenę, a podpis DKIM `d=mail.streakboard.app` przechodzi wyrównanie tylko w trybie relaxed.
- Skany botów kończą się na 404 bez kosztu poza jednym wywołaniem Workera. Reguła WAF i własny `robots.txt` to higiena, a nie naprawa.

## Konwencja między systemami

Typowa kolejność to: tanie nagłówki od razu, CSP najpierw w trybie Report-Only, DMARC najpierw z `p=none` i adresem raportów `rua`, a `quarantine` lub `reject` dopiero po sprawdzeniu raportów. Na domenie bez wysyłki z korzenia stosuje się SPF `-all` na korzeniu. Ujęcie właściciela odpowiada tej konwencji z jednym wyjątkiem: od razu proponuje `p=reject`.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: aplikacja nie wysyła nagłówków bezpieczeństwa, a domena nie ma polityki poczty. Polityka poczty musi uwzględniać, że poczta wychodzi z `mail.streakboard.app`.

Początkowe ujęcie było prawidłowe dla nagłówków i `security.txt`, więc ten kierunek zostaje. Są dwie korekty zakresu. (1) DMARC: `p=reject` od razu ryzykuje odcięcie maili z potwierdzeniem rejestracji, jeśli wyrównanie Resend się nie zgadza. Plan powinien wejść stopniowo i zawierać ręczny wiersz z testem prawdziwego maila. (2) CSP to najbardziej ryzykowny element: skrypty inline i przekierowanie OAuth wymagają rozpoznania, zanim jakakolwiek polityka zostanie wymuszona. WAF i `robots.txt` to opcjonalna higiena bez wpływu na bezpieczeństwo.

## Pewność

**WYSOKA**: każdy wymiar ma bezpośredni dowód z produkcji (curl, dig) albo `file:line` w repo.

## Co zmienia się dla /10x-plan

Plan ma trzy części:

- **Kod:** nagłówki i CSP Report-Only z rozpoznaniem skryptów inline, wysp i `form-action`, plus `security.txt`.
- **Ręczne kroki operatora:** HSTS; SPF `-all` na korzeniu; DMARC stopniowo (`none` z `rua`, potem `reject`), z wierszem „mail potwierdzający dochodzi”.
- **Opcjonalna higiena:** WAF i `robots.txt`, którą można odciąć bez straty.

## Weryfikacja przed planowaniem (2026-10-17)

- **Astro 7.3.2 ma stabilne `security.csp`** (`node_modules/astro/dist/core/config/schemas/base.js:244`): liczy hashe skryptów i stylów, ale politykę wstawia jako `<meta http-equiv="content-security-policy">` (`runtime/server/render/head.js:33`). Tag `<meta>` nie obsługuje trybu Report-Only, `frame-ancestors` ani `report-uri`. Tryb Report-Only i `frame-ancestors` muszą więc iść nagłówkiem, a wymuszenie trzeba wybrać między `<meta>` od Astro a nagłówkiem z hashami.
- **Test Report-Only na buildzie produkcyjnym** (tymczasowy nagłówek w middleware z `default-src 'self'`, Playwright na chromium, lokalny stos; patch i spec wycofane). Przy samym `'self'` pojawiły się tylko trzy naruszenia:
  - **Dwa skrypty inline runtime'u wysp Astro na każdej stronie z wyspą** (`sha256-QzWFZi+FLIx23tnm9SBU4aEgx4x8DsuASP07mfqol/c=`, `sha256-Ya0pUYrC7nM5Cn/056TyVuEiz6dFGrzmkWzgON0pF0U=`) oraz trzeci tylko na `/dashboard` i `/account/nickname` (`sha256-y5xabdxjZ6LpYK23+LnE3VCwrcR2NDi/8ysKDc+rjdA=`). Treść jest stała, więc hashe działają.
  - **Styl inline `astro-island,astro-slot,astro-static-slot{display:contents}`** (`sha256-vv9IoKo7BSLbWcUHr3tNmfNVmm5L/9Cfn2H6LMk7/ow=`).
  - **`form-action 'self'` przy „Continue with Google”**: POST do `/api/auth/google` przekierowuje 302 do Supabase Auth, a Chromium zgłasza naruszenie. Potwierdza to hipotezę 4: `form-action` musi obejmować origin Supabase Auth, a w produkcji też przekierowanie do Google.
  - Pozostałe sprawdzone strony (`/`, `/privacy`, 404) oraz service worker, manifest, obrazy i połączenia nie dały naruszeń.
- Hashe pochodzą z obecnego buildu i zmienią się przy aktualizacji Astro. Plan powinien je liczyć automatycznie (przez Astro albo przy buildzie), a nie wpisywać ręcznie.
- DMARC: poczta idzie przez Resend z `mail.streakboard.app`. Do potwierdzenia przez właściciela pozostaje linia `DKIM: PASS with domain mail.streakboard.app` w oryginale maila, zanim DMARC dostanie `p=reject`.

## Odniesienia

- Pliki źródłowe: `README.md:353-363`, `src/components/site/ClearErrorParam.astro:7`, `src/layouts/Layout.astro:52`, `src/lib/sentry-options.ts:34`, `src/middleware.ts`, `public/_headers`
- DNS (2026-10-17): `send.mail.streakboard.app` (MX, SPF), `resend._domainkey.mail.streakboard.app` (DKIM), brak `_dmarc.*` i SPF na korzeniu
- Powiązane badania: brak (`research.md` nie istnieje)
- Zadania badawcze: sondy wykonane bezpośrednio (curl i dig na produkcji, grep w repo); dowody były rozstrzygające, więc nie uruchamiano pod-agentów
