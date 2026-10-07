---
title: "Raport architektoniczny: do zrobienia"
created: 2026-10-07
type: todo
---

# Raport architektoniczny: do zrobienia

Notatka do `context/architect-report.md` (raport z modułu 4, 10xArchitect). To nie jest artefakt źródłowy. Zbiera rzeczy, które zostały do zrobienia po PR #85:

- [ ] **Autor dopisuje własne powody** przy czterech decyzjach z L5 (sekcja 1). Raport ma tam dziś „BRAK artefaktu”.
- [x] **Raport skrócony** do około dwóch stron (sekcja 2): z 4203 do 1371 słów (`wc -w`).
- [ ] **Długość po ogniwach „dlaczego”** (sekcja 2): recenzja z 2026-10-07 dodała przy każdym wyborze powód, z którego wynika następny krok, i raport ma znów ok. 1600 słów (1631 po trzeciej recenzji z tego dnia, `wc -w`), ok. 2,5–3 strony. „Kontekst” w §1 wycięto za radą drugiej recenzji; o pozostałych cięciach decyduje autor.

## 1. Do uzupełnienia przez autora

### Wymagane: „dlaczego” przy czterech decyzjach z L5

Prompt wymaga w §6: „co AI podpowiedziało, a co rozstrzygnąłeś samodzielnie i dlaczego”. Raport ma pierwsze dwie części. Własnych powodów autora nie ma w żadnym artefakcie: L5 zapisuje tylko powody swoich rekomendacji. Dlatego w raporcie stoi „BRAK artefaktu” i nie wolno tego uzupełniać domysłem ani powodami z L5.

| Decyzja                                  | Co raport mówi, że rozstrzygnięto                                                                               | Gdzie dopisać „bo …”                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 02 D-2, okno dat                         | luka zamknięta; funkcje SQL mają zapisywać tylko bieżący okres                                                  | `context/architect-report.md:78`, zdanie „Z L5 rozstrzygnąłem cztery sprawy …” |
| 02 D-1, okres widziany przez użytkownika | odznaczenie albo jego cofnięcie ma być odrzucane bez zapisu (HTTP 409), gdy widziany okres nie jest już bieżący | to samo zdanie                                                                 |
| 03 D-1, ACL                              | Fazy 1–3 i 6; Fazy 4–5 czekają                                                                                  | to samo zdanie                                                                 |
| Q-01, spadek streaka                     | reguła „połowa, w dół” jest ostateczna; do poprawy jest PRD, nie kod                                            | to samo zdanie                                                                 |

Kroki. Numery linii dotyczą stanu po dodaniu ogniw „dlaczego” (cały §6 to jeden akapit w linii 78), więc przy każdym kroku jest fraza do wyszukania.

1. `context/architect-report.md:78`, §6: zastąp zdanie „Dlaczego rozstrzygnąłem te cztery sprawy tak, a nie inaczej: BRAK artefaktu, bo …” swoimi powodami. Wystarczy jedno zdanie na całość albo cztery krótkie człony.
2. `context/architect-report.md:78` (opcjonalnie): w zdaniu „Z L5 rozstrzygnąłem cztery sprawy …” dopisz „bo …” po każdej z czterech decyzji; wtedy zdanie z kroku 1 wystarczy usunąć.
3. `context/architect-report.md:82`, „Luki”: usuń z listy BRAK fragment „moich uzasadnień czterech decyzji z L5,”.

Pisz własnymi słowami. To Twoje powody, więc nie musisz ich opierać na artefaktach. Tych samych decyzji dotyczy jeszcze punkt „Moja decyzja” w §5 (linia 72), ale prompt wymaga „dlaczego” tylko w §6, więc tam nic nie trzeba zmieniać. §5 podaje teraz przy ACL powód rekomendacji L5-03 (03 D-1: Fazy 1–3 i 6 zamykają kontrakt zerowych wierszy w jednym miejscu). To powód L5, nie Twój, i nie zastępuje Twojego „dlaczego” w §6. Powody wydłużą §6, który już jest najdłuższy względem budżetu (sekcja 2).

### Opcjonalnie

- **Otwarte kwestie produktowe** (`context/architect-report.md:78`, ostatnie zdanie §6, „Otwarte zostają …”): raport zgłasza dwie niewiadome, które rozstrzyga tylko właściciel produktu. Jeśli zapadną, dopisz je w §6 jako kolejne decyzje. (1) Reguła okresu: strefa Warszawa i poniedziałkowy początek `weekly` są w kodzie i w modelu L5 (T-10, N-19), ale PRD ich nie podaje (B-07). (2) Obsługa konfliktu 409 w UI: L5-02 przewiduje tylko przeładowanie strony (§4.6), bez komunikatu.
- **Pytania drugiej recenzji do §6, na które odpowiada tylko autor** (prompt ich nie wymaga): (1) czy poza powodem z L2 §1, który §3 już podaje (dostęp do danych „boli” najbardziej obok sesji), był własny powód wyboru data-access zamiast rankingu serii (jeśli powodem był właśnie link z L2, pierwsze zdanie §3 może mówić to wprost w pierwszej osobie, „Badałem data-access, bo …”, o co prosiła trzecia recenzja); (2) które rekomendacje L5 autor uznaje za dość potwierdzone, a które za hipotezę (np. scenariusz V4 jest wyprowadzony z kodu, L5-02 §3.6). Odpowiedź trafia do §6 słowami autora.
- **Zapis decyzji w artefaktach L5:** cztery decyzje z tabeli wyżej nie są zapisane w L5, które nadal pokazuje je jako otwarte, i raport mówi o tym wprost. Zapis byłby osobną zmianą. Artefaktów źródłowych celowo nie ruszano.

## 2. Długość raportu

**Wymaganie** (oryginalny prompt modułu 4): „zwięzły two-pager (~2 strony)” i „Maksymalnie dwie strony. Tnij, nie streszczaj wszystkiego.” Autor powtórzył je w liście kontrolnej: najwyżej około dwóch stron. Dwie strony to ok. 1000–1200 słów (szacunek przy 500–600 słowach na stronę prozy).

**Stan:** po skróceniu (`3171c8d`) recenzja z 2026-10-07 poprosiła, żeby przy każdym ważnym wyborze było widać, dlaczego wynika z poprzedniego ustalenia. Autor uznał tę zależność za ważniejszą niż liczba znalezionych problemów. Dodane ogniwa:

- dlaczego L3 bada akurat ten przepływ (L2 §1: tam najbardziej „boli”);
- jakie długi L3 obsługuje każda faza L4 (kolumna „dług L3”);
- dlaczego D12 dostaje w L4 tylko lekki strażnik (pełna bramka w S-10);
- dlaczego odłożono OPP-6, 7, 8 i 10;
- skąd L5-02 bierze INV-11 (ten sam wynik co ranking #1 L5-01, strefa ryzyka (3) z L2);
- dlaczego ACL dotyczy Supabase i dlaczego jego trasy czekają na sieć testów z L4;
- co w §6 zaproponowało AI, a co autor wybrał z L4.

Każde „więc”, które jest wnioskiem, ma teraz [I]. Żeby zrobić miejsce, ubyły:

- podział rozjazdów 8/1/3 (zastąpiła go tabela pojęć z kodem i rozjazdem);
- liczba wywołań bazy (V1);
- triggery przy tworzeniu grupy i tasku;
- „Progress: 0 z 43”.

Druga recenzja z 2026-10-07 (po `b16a05a`): D12 nazywa blast radius jak L3 §2.1 („release / blast radius”), a [I] stoi osobno przy scenariuszu i przy zasięgu; przegląd ficzera odsyła raz do L3 §1.1a zamiast trzech nawiasów, a V jest objaśnione przy pierwszym użyciu; §6 podaje powód wyboru pięciu okazji; „Kontekst” w §1 wycięto.

Trzecia recenzja z 2026-10-07: legenda objaśnia identyfikatory (V11, D12, OPP-2 pochodzą z artefaktów, a 02 D-2 to D-2 z L5-02); ocenę „najgroźniejszy” raport przypisuje wprost L5-03 (§2, §3.4); odwołanie „(§6.3)” po „Fazy 3 L4” brzmi teraz „(L5-03 §6.3)”, bo czytało się jak sekcja L4; zdublowane „(L5-02 D-1)” usunięto. Pozostałe uwagi tej recenzji dotyczyły starszej wersji (§1 z „Kontekstem”, [I] i blast radius) albo dopisywały decyzje, których autor nie podjął.

| Wersja                                       | Słowa (`wc -w`) |
| -------------------------------------------- | --------------- |
| master po PR #84 (`ff717ef`)                 | 1278            |
| po rundach recenzji (`560eeb3`)              | 3094            |
| po dodaniu elementów z promptu (`f71aa4e`)   | 4203            |
| po skróceniu (`3171c8d`)                     | 1371            |
| po ogniwach „dlaczego” (recenzja 2026-10-07) | 1607            |
| po drugiej recenzji (2026-10-07)             | 1614            |
| po trzeciej recenzji (2026-10-07)            | 1631            |

**Objętość teraz** (słowa bez składni tabel i nagłówków, wobec budżetu z propozycji skrócenia):

| Część                  | Słowa | Budżet |
| ---------------------- | ----- | ------ |
| legenda przed §1       | 39    | 0      |
| §1 Opisane projekty    | 74    | 120    |
| §2 Mapa projektu       | 151   | 150    |
| §3 Analiza ficzera     | 252   | 180    |
| §4 Plan refaktoryzacji | 280   | 250    |
| §5 Domena wg DDD       | 442   | 330    |
| §6 Decyzje             | 232   | 120    |
| Luki                   | 33    | 40     |
| razem                  | 1503  | 1190   |

To ok. 2,5–3 strony przy 500–600 słowach na stronę, czyli o 313 słów ponad budżet, głównie w §5, §6 i §3.

**Co jeszcze można uciąć** (decyzja autora; każde cięcie usuwa sprawdzony fakt albo ogniwo „dlaczego”):

- zastrzeżenie o neutralności planu w §4 (ok. 30 słów);
- wyliczenie otwartych spraw w §6, zastąpione odesłaniem do L5 (ok. 25 słów);
- w §5 porównanie z Sentry i Astro przy wyborze Supabase (ok. 12 słów; ogniwo „dlaczego”);
- w §5 zdanie o rekomendacji Faz 1–3 i 6 ACL i sieci testów z L4 (ok. 30 słów; ogniwo L4 → L5);
- „Stan” i „Wraca” w §3 połączone w jedno krótsze zdanie (ok. 15 słów).

**Co zachować przy dalszych zmianach** (ograniczenia z poleceń autora):

- nie modyfikować artefaktów źródłowych (L2–L5) ani kodu;
- decyzje z §6 (02 D-2, 02 D-1, 03 D-1, Q-01) zostają decyzjami autora, nie faktami z artefaktów; zostaje zastrzeżenie, że L5 nadal pokazuje je jako otwarte, a ich status się nie zmienia;
- przy R-08 zostaje rozróżnienie: znika dopiero po Fazie 3 (Migracja B), nie po Fazie 1;
- rzeczy niewdrożone opisujemy trybem planu („ma być”, „mają”), a przykład rozdziela fakt, projekt L5 (niewdrożony) i decyzję autora co najmniej raz;
- cudzysłów „…” tylko przy dosłownych cytatach, a każde twierdzenie ma odwołanie do artefaktu (sekcja, wiersz V, identyfikator);
- ogniwa „dlaczego” między sekcjami (polecenie autora z 2026-10-07): przy cięciu najpierw usuwamy liczby, które niczego nie rozstrzygają, a dopiero potem ogniwa; „więc”, które jest wnioskiem, ma [I], a „więc” w §6 to skutek decyzji, nie wniosek;
- [I] oznacza wniosek, także wniosek samego artefaktu (L2 §4: „więc nikt nie widzi…”; kolumna „Failure scenario [I]” w L3 §2.1), a odwołanie mówi, czyj; dwa wnioski w jednym zdaniu dostają osobne [I];
- nie dopisujemy decyzji, których autor nie podjął: zdania „nie wydzielam osobnego serwisu” i „nie zmieniam podziału Astro/React” proponowały trzy recenzje, a „DDD to materiał do kolejnego cyklu” trzecia z 2026-10-07; żaden artefakt tego nie proponuje (L5-03 §5.1 wspomina własny backend tylko jako granicę dowodu ACL); wyboru data-access nie zapisujemy jako „wybrałem, bo …” bez potwierdzenia autora;
- po każdej zmianie: `npx prettier --check context/architect-report.md` i ponowna weryfikacja liczb oraz odwołań do sekcji względem artefaktów.
