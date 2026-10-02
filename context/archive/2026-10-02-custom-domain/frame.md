# Frame Brief: Własna domena produktu (`custom-domain`)

> Etap ustalania ram przed /10x-plan. Ten dokument rejestruje, co jest _faktycznie_
> przedmiotem problemu, oddzielone od tego, co początkowo założono.

## Zgłoszona obserwacja

Aplikacja odpowiada dziś tylko pod `https://10x-astro-starter.mariusz-zlotucha.workers.dev` (`README.md:7`, `context/changes/deployment/deployment-plan.md:66`). Domena `streakboard.app` jest zarejestrowana (Cloudflare Registrar, DNS w Cloudflare), ale służy na razie tylko do poczty uwierzytelniającej z `mail.streakboard.app` (`README.md:250`); aplikacji na niej nie ma.

## Początkowe ujęcie (zachowane)

- **Podana przez użytkownika przyczyna lub podejście**: to praca operacyjna, bez UI i bez zmiany schematu: głównie kroki właściciela w Cloudflare i Supabase oraz poprawa dokumentacji (`context/foundation/roadmap-input-next-slices.md:26-39`, S-06 w `roadmap.md:86-98`).
- **Proponowany przez użytkownika kierunek**: podpiąć domenę do Workera i DNS; ustawić Site URL i Redirect URLs (w tym `/auth/callback`) w Supabase; sprawdzić link potwierdzający i własny SMTP; poprawić `README.md`, `deployment-plan.md` i `infrastructure.md`; wpisać wynik do `deployment-plan.md`. Los adresu `workers.dev` zostaje otwarty (S-06, Unknowns).
- **Zawężenie przed delegowaniem** (Krok 1.5, słowami użytkownika):
  - Kto opiera się dziś na `workers.dev`: „Tylko ja" (nikt inny nie ma konta ani linku zaproszeniowego).
  - Czy `streakboard.app` zostanie podany komuś przed S-09: „Nie, tylko zaproszeni" (do S-09 adres trafia wyłącznie w linkach `/join/<kod>` do osób z grona).

## Mapa wymiarów

Obserwacja i ramy mogą się załamać w każdym miejscu, w którym żyje adres aplikacji (← = objęte początkowym ujęciem):

1. **Wiązanie Cloudflare** — domena musi wskazywać na Workera, a wiązanie musi przetrwać kolejne wydania. ←
2. **Ustawienia Supabase Auth poza repo** — Site URL i Redirect URLs muszą pasować do adresu, z którego kod buduje link potwierdzający. ←
3. **Adres budowany w kodzie z hosta żądania** — link potwierdzający i link zaproszeniowy powstają z adresu, na którym akurat jest użytkownik; ciasteczka sesji i zaproszenia są przypięte do hosta.
4. **Bramka wydania** — zmienna `PRODUCTION_URL` w środowisku GitHub `production` wskazuje adres, który `release` sprawdza po każdym deployu.
5. **Dokumentacja i zapisy** — README, `deployment-plan.md`, `infrastructure.md`. ←
6. **Poczta uwierzytelniająca (Resend)** — czy zmiana adresu aplikacji dotyka nadawcy listów. ←

## Badanie hipotez

Werdykt = jak mocne są dowody, że w tym wymiarze leży praca lub ryzyko; „poza ramami" = początkowe ujęcie tego nie obejmowało.

| Hipoteza                                               | Dowody                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Werdykt                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Wiązanie Cloudflare nie przetrwa wydań              | `wrangler.jsonc` nie ma `routes` ani `workers_dev`; jedyna ścieżka wydań to `npx wrangler deploy` (`ci.yml:122`). Schemat Wranglera dopuszcza oba pola w repo (`node_modules/wrangler/config-schema.json`), ale nie mówi, czy deploy zachowuje wiązanie dodane w panelu ani czy przywraca `workers.dev`. Pierwsze wiązanie wymaga zatwierdzenia człowieka (`infrastructure.md:82`).                                                                                                                                                                 | SŁABE: luka do zbadania w `/10x-research`, brak dowodu awarii                                                                                                   |
| 2. Ustawienia Supabase poza repo rozjadą się z adresem | `README.md:252-258` („nic w repo ich nie ustawia"); `signup.ts:18` i `callback.ts:6-8`; dwa wcześniejsze incydenty tej klasy: Site URL = domyślny `http://localhost:3000` (`deployment-plan.md:132`) oraz brak wpisu na liście, więc ciche cofnięcie do Site URL (`README.md:257`).                                                                                                                                                                                                                                                                 | SILNE (w ramach): to tu produkcja psuje się po cichu                                                                                                            |
| 3. Adres wyprowadzany z żądania w kodzie               | `signup.ts:18` (`emailRedirectTo` z `request.url`), `dashboard.astro:131` (`Astro.url.origin` w linku zaproszeniowym). Ciasteczka `join_code` i `auth_email` bez `domain` (`join-code.ts:14-20`, `auth-email.ts:15-21`), sesja Supabase z `DEFAULT_COOKIE_OPTIONS` bez `domain` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11`), więc sesja i weryfikator PKCE są przypięte do hosta. Innego źródła adresu w kodzie nie ma: brak `localhost`, `:3000`, `:4321` w `src/`, brak URL w `public/`, `.env.example` bez zmiennej adresu. | SILNE (poza ramami): kod nie wymaga zmiany, jeśli linki powstają na docelowym hoście, ale link zaproszeniowy jest jedyną drogą nowej domeny do ludzi przed S-09 |
| 4. Bramka wydania patrzy na zły adres                  | `PRODUCTION_URL` występuje tylko w `ci.yml:129-131` i `README.md:218`. Lista zakresu w wejściu roadmapy jej nie wymienia, choć notatka z S-05 tak (`context/archive/2026-09-30-release-automation-and-auth-hardening/change.md:12`). Kontrola działa po deployu (`ci.yml:122`, potem `:127-131`).                                                                                                                                                                                                                                                   | SILNE (poza ramami): źle ustawiona w czasie daje czerwony `release` po udanym deployu albo kontrolę ślepą na awarię nowego adresu                               |
| 5. Dokumentacja                                        | `README.md:7,250,256`; `deployment-plan.md:66,81,83,87,127` (historia), `:185` (niezaznaczony punkt dla `*.workers.dev`), `:193` („Custom domain binding — deferred"). `infrastructure.md` nie zawiera `workers.dev` ani adresu, a `deployment-plan.md:118` mówi, że celowo go nie aktualizuje („research output, not a living runbook").                                                                                                                                                                                                           | SILNE dla README i `deployment-plan.md`; BRAK dla `infrastructure.md` (korekta zakresu)                                                                         |
| 6. Zmiana adresu dotyka poczty (Resend)                | Nadawca `noreply@mail.streakboard.app` na własnej poddomenie, potwierdzony rejestracją produkcyjną 2026-09-30 (`deployment-plan.md:139,150`, `README.md:250`); nie zależy od hosta aplikacji.                                                                                                                                                                                                                                                                                                                                                       | BRAK: wystarczy kontrola, że link w liście prowadzi na nowy adres                                                                                               |

## Sygnały zawężające

- „Tylko ja": nikt nie traci sesji ani linków, więc stary adres nie musi być zgodny wstecz. Zostaje kwestia operacyjna: dwa originy to dwa wpisy na liście Supabase i linki z dwoma hostami; `workers.dev` bywa też ścieżką powrotu na czas przepięcia. Mechanizm rozstrzyga plan.
- „Tylko zaproszeni": do S-09 nowy adres widzą tylko osoby, które dostały link `/join/<kod>`, czyli link zaproszeniowy z `dashboard.astro:131` jest jedynym „frontem" domeny. `/` (szablon startowy) nie jest wystawione, więc kolejność S-06 → S-09 się trzyma.
- Wniosek z obu odpowiedzi: przepięcie jest dziś najtańsze, bo nie ma jeszcze innych użytkowników; koszt rośnie z każdą zaproszoną osobą.
- Krok 4 (pytania po delegowaniu) pominięty: dowody są rozstrzygające, a żadne pytanie nie zmieniłoby rankingu hipotez.

## Konwencja między systemami

W tym repo adres zapisany w panelu, niewidoczny w kodzie, już dwa razy zepsuł produkcję po cichu (patrz wiersz 2). Za każdym razem naprawa to ustawienie w panelu i potwierdzenie produkcyjną rejestracją, a lekcja o zamykaniu wycinka (`lessons.md`: merge, zatwierdzenie `release`, ręczna kontrola głównego przepływu na produkcyjnym adresie, wpis w `deployment-plan.md`) wymaga skutku, nie samego wdrożenia. Wiodąca hipoteza (adres żyje poza kodem i trzeba go utrzymać spójnie) jest z tym zgodna. Niezależne wyszukiwanie: ogólny grep po `origin|URL|host` w `src`, `scripts` i `tests`, zrobiony przed sformułowaniem hipotez, znalazł dokładnie dwa miejsca w kodzie (`signup.ts:18`, `dashboard.astro:131`) i żadnego innego źródła adresu.

## Przeformułowany (lub potwierdzony) opis problemu

> **Rzeczywisty problem, wokół którego należy planować, to**: doprowadzić do tego, że `streakboard.app` jest jedynym adresem, który kod i otoczenie podają dalej, tak aby żaden link wysłany drugiej osobie (potwierdzający, zaproszeniowy) ani żadna kontrola wydania nie wskazywały po cichu na stary adres.

Początkowe ujęcie (operacyjne, bez zmiany schematu, Supabase jako najryzykowniejszy krok, poczta bez zmian) jest w większości poprawne, ale mierzy sukces tym, że domena odpowiada. Adres nie jest w repo jedną wartością: żyje w trzech miejscach poza kodem (Cloudflare, panel Supabase, zmienna `PRODUCTION_URL` w GitHubie), w dokumentacji i pośrednio w dwóch linkach budowanych z hosta żądania. Z zakresu wypadły `PRODUCTION_URL` i link zaproszeniowy; skurczył się zakres dokumentacji (`infrastructure.md` nie zawiera adresu). Pytanie o `workers.dev` rozstrzygnęło się częściowo: zgodność wsteczna nie jest wymaganiem, bo nikt poza właścicielem go nie używa.

## Pewność

**WYSOKA** — dowody z `file:line` dla wymiarów 2–5, zgodność z konwencją repo (dwa wcześniejsze incydenty) i dwa rozstrzygające sygnały od użytkownika. Wymiar 1 (trwałość wiązania Cloudflare) to znana luka wiedzy dla `/10x-research`, nie zagrożenie dla samego przeformułowania.

## Co zmienia się dla /10x-plan

Plan ma objąć pełną listę miejsc, w których żyje adres (Cloudflare, Supabase, `PRODUCTION_URL`, README i `deployment-plan.md`), kolejność ich zmiany (produkcja nigdy nie wskazuje na adres, który jeszcze nie odpowiada) oraz weryfikację skutku na nowym adresie: rejestracja z linkiem z e-maila kończąca się zalogowaniem, link zaproszeniowy skopiowany z dashboardu na nowym hoście, kontrola `release` na nowym adresie. Bez `infrastructure.md` i bez zgodności wstecznej starego adresu; czy `workers.dev` zostaje na czas przepięcia jako ścieżka powrotu, rozstrzyga plan.

Do zbadania w `/10x-research`:

- czy `wrangler deploy` zachowuje wiązanie domeny dodane w panelu i czy przywraca `workers.dev`, gdy `wrangler.jsonc` nie ma `routes` ani `workers_dev`;
- co dziś jest w DNS apexu `streakboard.app` oraz na liście Redirect URLs i w Site URL (README to zapis z 2026-09-30; aktualny stan widzi tylko właściciel w panelach).

Drobne, nierozstrzygnięte: `www.streakboard.app` (domyślnie poza zakresem) oraz `site` w `astro.config.mjs` (dziś `sitemap()` bez `site` jest pomijany, `node_modules/@astrojs/sitemap/dist/index.js:45`; poza zakresem, o ile użytkownik nie zdecyduje inaczej).

## Odniesienia

- Pliki źródłowe: `src/pages/api/auth/signup.ts:18`, `src/pages/dashboard.astro:131`, `src/pages/auth/callback.ts:6-8`, `src/lib/join-code.ts:14-20`, `src/lib/auth-email.ts:15-21`, `wrangler.jsonc`, `.github/workflows/ci.yml:122,127-131`, `README.md:7,218,250,252-258`, `context/changes/deployment/deployment-plan.md:66,118,132,139,150,185,193`, `context/foundation/infrastructure.md:82`, `context/foundation/roadmap.md:86-98`, `context/foundation/roadmap-input-next-slices.md:26-39`
- Powiązane badania: brak (`/10x-research custom-domain` jeszcze nie uruchomiono)
- Zadania badawcze: brak; hipotezy zbadane bezpośrednio, bez pod-agentów
